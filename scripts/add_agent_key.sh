#!/bin/bash
# 🔑 Add agent SSH key
set -e
mkdir -p /root/.ssh
chmod 700 /root/.ssh
KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPTCAMHDYCxyKZGB+dGLaIotXGVIpZkFRWG10YP7mWac zenrex-agent'
grep -qF "$KEY" /root/.ssh/authorized_keys 2>/dev/null || echo "$KEY" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
echo "✅ SSH key added successfully"
echo "Agent IP to whitelist: 35.193.209.116"
grep zenrex-agent /root/.ssh/authorized_keys && echo "✅ Key verified in authorized_keys"
