# Capacity environment knobs

- `CAPACITY_CHECKS_DISABLED`: if "true", skip all capacity checks and allow operations to proceed.
- `CAP_CPU_MIN`: minimal CPU slots required. Consumed by capacity gate if implemented in checkCapacity.
- `CAP_MEM_MIN_MB`: minimal free memory (MB) required.
- `CAP_PORTS_REQUIRED`: comma-separated list of ports to require as free before compose or install.
- `CAP_DOCKER_REQUIRED`: if "true", capacity wire may require Docker to be reachable (future hook).

These are read by the runtime wrapper and passed to the capacity gate. Unit tests do not depend on them.
