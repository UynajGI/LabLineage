# Security policy

## Reporting

Do not open a public issue for a suspected vulnerability or exposed research
credential. Use GitHub private vulnerability reporting for this repository, or
contact the repository owner through an agreed private channel.

Include the affected version, impact, reproduction steps that use synthetic
data, and any evidence of exposure. Do not attach real research data, tokens,
private keys, database dumps, Terraform state, or `.lablineage/` content.

## Supported version

Until the first stable release, only the latest commit on `main` receives
security fixes. Release evidence must pass checksum and Sigstore verification
before deployment.

## Response

Maintainers will acknowledge a report, preserve relevant audit evidence,
revoke/rotate affected credentials, assess tenant and project scope, prepare a
fix and coordinate disclosure. Credentials shown in any report must be treated
as compromised and rotated.
