# Third-Party Notices

## seralifatih/congress-trading-pipeline

Portions of the backend under `backend/vendor/congress-trading-pipeline/` are derived from the open-source project:

- Repository: https://github.com/seralifatih/congress-trading-pipeline
- Components used: `house/` and `senate/` trading disclosure pipelines

The upstream project’s README and actor documentation identify the project as **MIT licensed** (“MIT” / “MIT. Use the actor or the source however you want.”).

At the time of vendoring, the upstream repository did **not** include a standalone `LICENSE` file or an explicit copyright holder line. No copyright notice was invented for this project.

Apify-specific entry points, Express API servers, cron schedulers, and SQLite/Apify storage adapters from upstream were **not** retained for this application’s runtime path. The retained code focuses on official U.S. government disclosure fetching, PDF/HTML parsing, normalization, retry helpers, and SHA-256 transaction identity helpers.

Application-owned code (normalization to our schema, Supabase storage, and the manual `update-data` runner) lives under `backend/src/` and is separate from the vendored pipeline.

### MIT License (as commonly published)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
