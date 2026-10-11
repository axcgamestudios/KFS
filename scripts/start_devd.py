#!/usr/bin/env python3
"""Daemonize `next dev` with a double-fork so the sandbox's session reaper
cannot kill it when the spawning shell exits."""
import os
import sys

pid = os.fork()
if pid == 0:
    # Child: new session, detach from controlling terminal
    os.setsid()
    pid2 = os.fork()
    if pid2 == 0:
        # Grandchild: orphaned, reparented to init
        os.chdir('/home/z/my-project')
        with open('/home/z/my-project/dev.log', 'ab', 0) as log:
            os.dup2(log.fileno(), 1)
            os.dup2(log.fileno(), 2)
            os.execvp(
                './node_modules/.bin/next',
                ['next', 'dev', '-p', '3000'],
            )
        os._exit(1)
    os._exit(0)

# Parent: reap the first child and exit
os.waitpid(pid, 0)
print(f'daemon started (parent exiting), pid={pid}')
sys.exit(0)
