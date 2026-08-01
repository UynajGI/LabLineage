# Demo Scan Directory

Sample research project used by the Cloud Run demo instance to exercise the
scan → snapshot → diff → audit pipeline. Judges scan `/app/demo-scan`.

The `.env` file is intentionally present: the scanner must skip secret-shaped
files (the token is a fake placeholder).
