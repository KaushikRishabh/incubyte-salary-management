# Before submission

The local implementation is complete, but the brief's hosted deployment and repository-link submission are not yet complete.

1. Candidate runs the project, reviews the requirements/design/code/tests and can explain the decisions in `walkthrough.md`. Change anything they disagree with. AI assistance remains disclosed.
2. Obtain permission for the exact repository account, name, visibility and recruiter access. The supplied Git bundle preserves real commit history; clone it rather than flattening it into one upload. Do not publish personal information or secrets.
3. Choose an authorized hosting destination capable of running Python/ASGI with persistent SQLite storage. Deploy one application instance, not multiple replicas sharing an unsuitable filesystem. Keep the database on persistent storage, use TLS, configure platform request limits and health checks, and verify persistence after restart. The Dockerfile is a starting point, not a verified container build.
4. Confirm any cost, account creation, terms or persistent credential permissions separately. No paid resource or new credential is authorized by local implementation.
5. Use only synthetic data. This application deliberately has no authentication or authorization. A publicly accessible demo lets other people change the fictional records. Prefer restricted reviewer access, or explicitly accept that demo limitation. Real payroll use requires authentication, roles, actor identity, immutable audit infrastructure, backups, monitoring, retention policy and further review.
6. Verify the deployed UI and API, confirm the 10,000-record seed and run the walkthrough. Record a genuine narrated live demonstration if required. The included screenshot video is clearly labelled and not continuous recording.
7. Candidate approves the final recruiter reply with the repository, deployed URL, video and AI disclosure. No assessment submission has been sent.
