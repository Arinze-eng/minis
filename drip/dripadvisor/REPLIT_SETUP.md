# DripAdvisor Replit handoff

This project is designed to run with real providers when secrets are present and to keep working with Manus-provided fallbacks when they are absent.

## Required for the real product

```env
MODEL_API_KEY=your_meta_model_api_key
NEON_DATABASE_URL=your_neon_pooled_postgres_url
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

The current WebDev preview now prefers `NEON_DATABASE_URL` for the feature store and creates the PostgreSQL tables automatically. The original `DATABASE_URL` remains the template's MySQL/TiDB auth database. Do not copy the current WebDev `DATABASE_URL` into Replit as the feature database; use the Neon pooled connection string under `NEON_DATABASE_URL`.

## Provider behavior

- `MODEL_API_KEY` present: use Meta Model API and `muse-spark-1.1` for garment understanding and outfit recommendations.
- `MODEL_API_KEY` absent: use the Manus built-in LLM fallback when available.
- Cloudinary variables present: use Cloudinary for uploaded wardrobe images.
- Cloudinary variables absent: use Manus storage for the preview environment.
- Manus image generation is the current preview generator. Muse Image remains a separate provider swap because its exact generation endpoint and account capability should be verified against the active Meta documentation before production.

## Run commands

```bash
pnpm install
pnpm drizzle-kit generate
pnpm run dev
```

Run validation before moving the project:

```bash
pnpm test
pnpm check
pnpm build
```

## First production hardening tasks

1. Decide whether the template auth tables should also move from MySQL/TiDB to PostgreSQL/Neon; the current feature store already uses `pg` and Neon.
2. Apply the generated PostgreSQL feature schema through the migration system if automatic bootstrap is not desired.
3. Wrap wardrobe and outfit procedures with `protectedProcedure` after authentication is enabled.
4. Add Cloudinary deletion and retention jobs; the current preview adapter only uploads.
5. Verify Meta’s current Muse Image API contract and add it as a server-side provider behind the existing preview procedure.
6. Add rate limiting, MIME/content validation, image-size limits, EXIF stripping, and audit logging before accepting arbitrary user images.

## Safety

Never put `MODEL_API_KEY`, `CLOUDINARY_API_SECRET`, or `DATABASE_URL` in the React client, `VITE_` variables, Git, or public documentation. The current UI is clearly marked as preview mode and shares a demo owner ID until authentication is enabled.
