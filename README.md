# SurfFit 🦫

Track your surf sessions.

![status](https://img.shields.io/badge/status-phase%201-blue)

## Quickstart

```
git clone <repo-url>
cd training
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm dev            # web + worker in dev mode
```

Or run `pnpm --filter web dev` and `pnpm --filter worker dev` in separate terminals.

## Docs

- Architecture spec: [`docs/superpowers/specs/2026-07-15-surffit-architecture-design.md`](docs/superpowers/specs/2026-07-15-surffit-architecture-design.md)
- Phase 1 implementation plan: [`docs/superpowers/plans/2026-07-15-surffit-phase1-foundation.md`](docs/superpowers/plans/2026-07-15-surffit-phase1-foundation.md)
- Project conventions: [`CLAUDE.md`](CLAUDE.md)

## License

License: TBD before public launch.
