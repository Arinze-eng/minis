# DripAdvisor: web-first architecture

## Product decision

The first release is a **web UI prototype**. It validates the wardrobe workflow before authentication, Neon persistence, Cloudinary uploads, and live model calls are enabled.

The current milestone has moved beyond a static mock: the app now calls **Muse Spark 1.1** when `MODEL_API_KEY` is configured, falls back to the Manus LLM when it is not, persists wardrobe/outfit/feedback records through the available project database, uploads images through Manus storage by default, and switches to Cloudinary when its server-side credentials are supplied.

The prototype intentionally uses local demo state. Uploading an image adds a local demo garment to the wardrobe. Styling a request simulates the agent response. This makes the product testable without exposing credentials or making an external AI request.

## Runtime shape

```text
React WebUI
    ↓
Typed tRPC contracts
    ↓
Express server
    ↓
Atlas wardrobe service (next integration)
    ├── ownership and consent policy
    ├── wardrobe tools
    ├── deterministic outfit planner
    └── preview job manager

Future integrations
    ├── Neon PostgreSQL: structured data and workflow state
    ├── Cloudinary: garment images and generated previews
    ├── Muse Spark 1.1: image understanding, tool use, and explanations
    └── Muse Image 1.0: outfit-preview generation and refinement
```

Authentication is deliberately deferred. Until it is enabled, the application must remain in demo mode and must not be presented as a private multi-user wardrobe. The current procedures use owner ID `0` for the preview path.

## Frontend screens in the first prototype

| Screen | Purpose |
|---|---|
| Overview | Ask for an outfit, inspect wardrobe health, see weather context, and review suggested looks |
| My wardrobe | Browse pieces by category, add a garment, and remove demo items |
| Saved looks | Review selected outfit plans and simulate another version |
| Upload modal | Choose an image and create a local demo wardrobe item |

The visual system uses a dark graphite navigation rail, warm paper background, lime action color, lilac secondary accent, and Space Grotesk / DM Sans typography. The style is deliberately editorial rather than a generic admin dashboard.

## Model boundaries

Muse Spark 1.1 should be used for:

- Understanding natural-language styling requests.
- Reading garment images.
- Returning validated structured garment attributes.
- Calling wardrobe and weather tools.
- Explaining why an outfit was selected.

Muse Spark should not be responsible for:

- User ownership.
- Consent enforcement.
- Database writes without a backend check.
- Image deletion.
- Deciding whether an external provider may receive a private image.

The deterministic wardrobe service should select candidate outfits from confirmed garment records. The model can rank or explain those candidates, but it should not invent garments that the user does not own.

Muse Image 1.0 should be used separately for visual previews. Every preview should display the following notice:

> AI-generated visual approximation; garment details and fit may not be exact.

## API contract sequence

The next backend iteration should expose these small operations:

1. `wardrobe.list`
2. `wardrobe.createUploadIntent`
3. `wardrobe.confirmItem`
4. `wardrobe.deleteItem`
5. `outfits.recommend`
6. `outfits.requestPreview`
7. `outfits.feedback`

The request and validation schemas are already defined in `server/dripadvisor.contracts.ts`. Authentication will later wrap these procedures with a protected user context. Before that point, only seeded demo data should be used.

## Data flow after integrations are enabled

### Garment upload

```text
Browser selects image
    → backend validates MIME type and size
    → backend requests a signed Cloudinary upload
    → Cloudinary returns asset metadata
    → Neon stores image_assets row
    → Muse Spark analyzes the image
    → user confirms the proposed attributes
    → Neon stores wardrobe_items row
```

### Outfit recommendation

```text
User writes request
    → Muse Spark extracts intent into a bounded request
    → backend loads confirmed wardrobe items
    → weather tool returns a timestamped snapshot
    → deterministic planner creates candidates
    → Muse Spark explains the selected candidate
    → Neon stores the outfit plan
```

### Preview generation

```text
User clicks Generate preview
    → backend checks preview consent
    → backend creates an idempotent background job
    → approved garment references are sent to Muse Image
    → generated image is uploaded to Cloudinary
    → Neon stores preview metadata
    → WebUI polls or streams job status
```

## Research patterns incorporated

Comparable wardrobe products consistently reduce initial friction by combining visual item cards, category filtering, manual correction, outfit boards, and explicit user feedback. The prototype therefore emphasizes:

- Upload one piece at a time.
- Keep detected attributes editable.
- Make the wardrobe visible before asking the user to trust a recommendation.
- Treat saved looks as a small library, not a chat transcript.
- Keep a clear distinction between owned wardrobe data and generated inspiration.
- Use explicit save/reject actions instead of silently learning preferences.

These patterns are consistent with the product workflows of Acloset, Whering, Stylebook, and Indyx; the detailed comparison is being finalized from their public product materials.

### Research sources

The implementation patterns were cross-checked against the public product materials for [Acloset](https://www.acloset.app/), [Whering](https://whering.co.uk/), [Stylebook](https://www.stylebookapp.com/features.html), and [Indyx](https://www.myindyx.com/how-it-works). These sources informed the guest-first prototype, editable metadata, visual closet, constrained outfit planning, explicit feedback, and privacy-by-default decisions.

### Current provider status

Muse Spark 1.1 has been authenticated against `https://api.meta.ai/v1/models` and a live structured outfit recommendation smoke test has passed. Requests use the Chat Completions protocol with `response_format` JSON Schema and `reasoning_effort: minimal` to keep the agent response bounded. The current image-preview action uses the Manus image service as a working fallback; the Muse Image endpoint remains intentionally isolated until its exact current generation contract is verified for the project account.

## Integration order

1. Validate this local UI with representative user flows.
2. Add a backend mock router using the shared schemas.
3. Add Muse Spark through the server-side OpenAI-compatible client.
4. Add image understanding for one garment at a time.
5. Connect Neon using the previously prepared schema and a PostgreSQL adapter.
6. Connect Cloudinary for private asset storage.
7. Add deterministic outfit recommendation persistence.
8. Add Muse Image previews as an asynchronous job.
9. Add authentication and user isolation.

## Required secrets when we reach the integration stage

```text
MODEL_API_KEY=<Meta Model API key for Muse Spark and Muse Image>
DATABASE_URL=<Neon pooled PostgreSQL connection string>
CLOUDINARY_CLOUD_NAME=<Cloudinary cloud name>
CLOUDINARY_API_KEY=<Cloudinary API key>
CLOUDINARY_API_SECRET=<Cloudinary API secret; server only>
```

Do not add these values to the React client, commit them to Git, or paste them into public chat. The API key should be placed in the project's server-side secret configuration when the live model integration begins.
