Deploy Finalization Checklist

Purpose

- Ensure release artifacts are consistent, verifiable, and rollback-ready across environments.

Checklist

- [ ] Artifact naming conventions documented:
  - Exe/bundles: cw-finance-<version>-<arch>.exe
  - Client/server bundles: client-<version>._, server-<version>._
- [ ] Checksums generated for all artifacts:
  - SHA256 or SHA512 for each artifact
- [ ] Release notes created:
  - Summary of changes, migration notes, and known issues
- [ ] Rollback plan defined:
  - Steps to restore previous artifact/version
  - Data migration notes if applicable
- [ ] Deployment verification steps:
  - Sanity checks (health endpoint, DB initialization, UI load)
  - Time to first successful response < N seconds
- [ ] Environment parity verification:
  - Dev, staging, and prod verification runbooks exist
- [ ] Secrets/access control:
  - No secrets embedded in artifacts; references managed via CI/CD vault
- [ ] Artifacts published to artifact store with metadata
- [ ] Post-release monitoring plan documented

Owner: <name>
Last updated: <date>
