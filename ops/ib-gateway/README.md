# IB Gateway VPS Evaluation

Decision: keep the Mac Studio adapter for the current product and prepare a fixed-egress Linux VPS as the high-availability successor. Do not run IB Gateway as a Railway cron or expose its raw API port publicly.

## Acceptance Gates

1. Provision a small x86_64 VPS with a static public IP, encrypted disk, host firewall, automatic security updates and an operator VPN/SSH path.
2. Create `secrets/tws_password.txt` outside Git, `chmod 600` it, and populate `.env` from `.env.example`.
3. Start in `paper` + `READ_ONLY_API=yes`. Complete the initial IBKR 2FA challenge manually.
4. Verify port 4002 is reachable only from localhost or the private collector network. Never bind 4001/4002 to `0.0.0.0`.
5. Run 72 hours of reconnect/restart tests, including nightly auto-restart, VPS reboot and missed 2FA. Confirm no duplicate client IDs and no stale-data continuation.
6. Move only the read-only collector after the soak test. Keep Mac Studio as rollback until cloud coverage and freshness match.
7. Enabling live mode or write access is a separate strategy-behavior/deployment decision and is outside this evaluation.

The pinned image is a reviewed starting point, not an automatic-upgrade channel. Review release notes and test paper mode before changing it.
