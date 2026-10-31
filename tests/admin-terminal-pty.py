"""Exercise real Node TTY masking and restoration; all inputs are generated test data."""
import os, pathlib, pty, re, secrets, select, signal, subprocess, termios, time, unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]

class Session:
    def __init__(self, script='tests/fixtures/admin-terminal.ts', extra_env=None):
        self.master, self.slave = pty.openpty()
        self.before = termios.tcgetattr(self.slave)
        env = os.environ.copy()
        if extra_env: env.update(extra_env)
        self.child = subprocess.Popen(['node',script],cwd=ROOT,stdin=self.slave,stdout=self.slave,stderr=self.slave,env=env,start_new_session=True)
        self.output = b''
    def collect(self, seconds=.08):
        end=time.monotonic()+seconds
        while time.monotonic()<end:
            ready,_,_=select.select([self.master],[],[],min(.04,max(0,end-time.monotonic())))
            if ready:
                try: data=os.read(self.master,65536)
                except OSError: break
                if not data: break
                self.output+=data
    def expect(self, marker):
        target=marker.encode();deadline=time.monotonic()+7
        while target not in self.output and time.monotonic()<deadline:
            self.collect(.05)
            if self.child.poll() is not None: break
        if target not in self.output: raise AssertionError('Expected terminal prompt/result was not received')
    def line(self, value): os.write(self.master,value.encode()+b'\n')
    def finish(self):
        deadline=time.monotonic()+7
        while self.child.poll() is None and time.monotonic()<deadline:self.collect(.05)
        self.collect(.05)
        if self.child.poll() is None: raise AssertionError('Terminal process did not exit after input/cancellation')
        after=termios.tcgetattr(self.slave)
        mask=termios.ECHO|termios.ICANON
        if after[3]&mask != self.before[3]&mask: raise AssertionError('Terminal echo/canonical mode was not restored')
        return self.child.returncode
    def close(self):
        if self.child.poll() is None:self.child.kill();self.child.wait()
        os.close(self.master);os.close(self.slave)

class HiddenInput(unittest.TestCase):
    def setUp(self):
        # Generated only in RAM; never put these values in environment variables or files.
        self.password='Z9!'+secrets.token_hex(16)
        self.url='postgres://test_owner:'+secrets.token_hex(18)+'@db.example.com/test?sslmode=require'
        self.email='owner@example.com';self.session=Session()
    def tearDown(self): self.session.close()
    def start(self):
        self.session.expect('[1/4]');self.session.line(self.url)
        self.session.expect('[2/4]');self.session.line(self.email)
        self.session.expect('[3/4]')
    def assert_hidden(self):
        for secret in [self.url,self.password,self.email]:self.assertTrue(secret.encode() not in self.session.output,'User input was echoed')
    def test_successful_input_never_echoes_and_restores_terminal(self):
        self.start();self.session.line(self.password);self.session.expect('[4/4]');self.session.line(self.password)
        self.session.expect('[INPUT_ACCEPTED]');self.assertEqual(self.session.finish(),0);self.assert_hidden()
    def test_mismatch_is_rejected_without_echo(self):
        self.start();self.session.line(self.password);self.session.expect('[4/4]');self.session.line(self.password+'different')
        self.session.expect('[INPUT_REJECTED]');self.assertNotEqual(self.session.finish(),0);self.assert_hidden()
    def test_ctrl_c_cancels_hidden_password_and_restores_echo(self):
        self.start();partial=self.password[:14];os.write(self.session.master,partial.encode());self.session.collect();os.write(self.session.master,b'\x03')
        self.session.expect('[INPUT_REJECTED]');self.assertNotEqual(self.session.finish(),0);self.assertTrue(partial.encode() not in self.session.output,'Partial secret was echoed');self.assert_hidden()
    def test_sigterm_cancels_hidden_input_and_restores_echo(self):
        self.start();os.write(self.session.master,self.password.encode());self.session.collect();self.session.child.send_signal(signal.SIGTERM)
        self.session.expect('[INPUT_REJECTED]');self.assertNotEqual(self.session.finish(),0);self.assert_hidden()
    def test_eof_cancels_and_restores_echo(self):
        self.session.expect('[1/4]');os.write(self.session.master,b'\x04')
        self.session.expect('[INPUT_REJECTED]');self.assertNotEqual(self.session.finish(),0);self.assert_hidden()
    def test_multiline_paste_does_not_echo_following_secrets(self):
        self.session.expect('[1/4]');self.session.line(self.url+'\n'+self.email+'\n'+self.password+'\n'+self.password)
        self.session.collect(.2)
        if self.session.child.poll() is None:os.write(self.session.master,b'\x03')
        self.assertNotEqual(self.session.finish(),0);self.assert_hidden()
    def test_backspace_edits_hidden_password(self):
        self.start();os.write(self.session.master,self.password.encode()+b'X\x7f\n');self.session.expect('[4/4]');self.session.line(self.password)
        self.session.expect('[INPUT_ACCEPTED]');self.assertEqual(self.session.finish(),0);self.assert_hidden()

class Noninteractive(unittest.TestCase):
    def test_environment_variables_and_pipe_cannot_initialize(self):
        env=os.environ.copy()
        env.update({'ADMIN_EMAIL':'unused-marker','ADMIN_PASSWORD':'unused-marker','DATABASE_URL':'unused-marker'})
        result=subprocess.run(['node','scripts/admin.ts'],cwd=ROOT,input='unused-pipe-marker',capture_output=True,text=True,env=env)
        self.assertEqual(result.returncode,1)
        self.assertIn('交互终端',result.stdout+result.stderr)
        self.assertNotIn('unused-marker',result.stdout+result.stderr)
        self.assertNotIn('unused-pipe-marker',result.stdout+result.stderr)
    def test_argument_is_not_used_or_echoed(self):
        result=subprocess.run(['node','scripts/admin.ts','unused-argument-marker'],cwd=ROOT,input='',capture_output=True,text=True)
        self.assertEqual(result.returncode,1)
        self.assertIn('交互终端',result.stdout+result.stderr)
        self.assertNotIn('unused-argument-marker',result.stdout+result.stderr)

if __name__=='__main__':unittest.main(verbosity=2)
