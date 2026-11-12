# GridOps — OT / critical-infrastructure CTF

GridOps is the asset portal of a regional electricity grid operator: substations,
RTUs and PLCs, all on one tidy map, run by a company that is *very* confident its
operations are airtight.

> **"Zero trust. Zero downtime. Zero incidents reported."**
> Your job is to put an asterisk on at least one of those.

The whole challenge runs locally from prebuilt container images — no source code,
no build step, no internet access needed once the images are pulled.

## Requirements

- **Docker Engine** with the **Compose v2** plugin (the `docker compose`
  command). Docker Desktop includes it.
- A few GB of free disk for the images (one of them is large).

## Run it

From the folder containing `docker-compose.yml`:

```bash
docker compose pull      # fetch the images
docker compose up -d     # start the stack
```

Then open the portal:

**→ http://localhost:8100**

That is your entry point. A few supporting containers start alongside it; you
only need the portal to begin.

Give it a few seconds on first start — the containers need a moment to come up.

Your end goal is to find the super secret emergency dispatch key (`/opt/gridops/emergency-dispatch-key.txt`).


## Stop, reset, clean up

```bash
docker compose restart web   # reset the challenge to a clean state
docker compose stop          # stop, keep everything
docker compose down          # stop and remove the containers
docker compose logs -f web   # watch the portal's logs
```

Challenge state is kept in memory, so `restart web` is the quick way back to a
fresh start.

## Options

The compose ships with sensible defaults; you don't need to configure anything.
To change the image source, tag, or host ports, copy `.env.example` to `.env`
and uncomment what you want to override.

## Safety

This is deliberately vulnerable software built for training. Run it on a local
machine or an isolated lab network only — **never expose it to the internet.**
