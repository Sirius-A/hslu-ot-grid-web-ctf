# GridOps — OT / critical-infrastructure CTF

A CTF challenge for the HSLU CTF group.

GridOps is the asset portal of a regional electricity grid operator: substations,
RTUs and PLCs, all on one tidy map, run by a company that is *very* confident its
operations are airtight.

> About-page motto: **"Zero trust. Zero downtime. Zero incidents reported."**  
> 
> Your job is to put an asterisk on at least one of those.

Everything runs locally — no internet access needed.

## Run it locally

```bash
docker compose up -d --build
```

**Entry point: http://localhost:8100** — start here. A few supporting containers
come up alongside the portal; you only need the portal to begin.

State is kept in memory, so `docker compose restart web` gives you a clean slate.

### One isolated instance per student

`ctf.sh` offsets ports and the compose project name so several instances coexist
on one host:

```bash
./ctf.sh up 07        # portal :8107, project hslu-ot-ctf-07
./ctf.sh logs 07
./ctf.sh down 07
```

## For instructors (contains spoilers)

Design, solutions and distribution — **don't open these if you plan to solve the
challenge yourself**:

| Document | For |
|----------|-----|
| [`docs/DESIGN.md`](docs/DESIGN.md) | How the lab is built, the vulnerabilities, env/difficulty knobs |
| [`solution/WALKTHROUGH.md`](solution/WALKTHROUGH.md) | Step-by-step solve |
| [`solution/SOLUTION.md`](solution/SOLUTION.md) | Teaching notes and root-cause analysis |
| [`deploy/README.md`](deploy/README.md) | Publish images to GHCR and hand students a pull-only compose |

Health check (confirms an instance is solvable end to end):
`cd solution && ./exploit.py && ./exploit_stage2.py`.

## Safety

Deliberately vulnerable software. Run it on a local machine or an isolated lab
network only — never expose it to the internet.
