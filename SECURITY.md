# Security policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.1.x | yes |
| 1.0.x | no |

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private reporting flow:
[Security → Report a vulnerability](https://github.com/XNtriCT/flect/security/advisories/new).

Include the version, the steps to reproduce, and what an attacker gains. You can
expect an acknowledgement within a few days and a fix or a written explanation
within thirty.

## What FLECT stores and sends

- **API keys** are saved through Electron's `safeStorage`, which uses the
  Windows credential store (DPAPI). On a platform where encryption is
  unavailable, the key is stored unencrypted and marked as such in the settings
  file. Nothing else in the app writes credentials to disk.
- **Manuscript text** leaves the machine only when you invoke an AI action, and
  then only to the endpoint you configured. There is no telemetry, no crash
  reporting, and no analytics.
- **Documents** are read and written locally. The app has no upload path of its
  own.

## Scope

Symptoms worth reporting:

- a way to make the renderer reach the file system or Node APIs outside the
  preload bridge
- a way to read a stored API key, or to make the app send one to an unexpected
  host
- remote code execution through an opened document or a model response
- an export path that writes outside the chosen destination

Not in scope: the absence of code signing on the installer, provider-side issues
in a third-party API, and anything that requires an already-compromised machine.
