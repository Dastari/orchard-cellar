# Orchard runtime services

The public NPM host forwards the game to `10.0.1.150:5173`. The frontend is
supervised by `orchard-frontend.service` and proxies same-origin `/v1` HTTP and
WebSocket traffic to the loopback-only SpaceTimeDB host supervised by
`orchard-world.service`.

Install or refresh the units with:

```bash
sudo install -m 0644 ops/orchard-runtime/systemd/orchard-world.service /etc/systemd/system/
sudo install -m 0644 ops/orchard-runtime/systemd/orchard-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now orchard-world.service
curl -fsS http://127.0.0.1:3000/v1/ping
npm run publish:local -w @orchard/world
sudo systemctl enable --now orchard-frontend.service
```

Publishing is deliberately separate from starting the durable host. Module
updates must be built, checked, backed up, and explicitly published without
`--delete-data`. Both services use `Restart=always` and start at boot. Inspect
their logs with `journalctl -u orchard-world -u orchard-frontend`.
