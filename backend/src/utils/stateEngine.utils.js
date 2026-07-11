// ── State transition rules ─────────────────────────────────────────────────
//
// A monitor does NOT immediately flip to DOWN on one failure.
// It requires N consecutive failures (failureThreshold, default 2).
// Similarly, it does NOT immediately recover on one success.
// It requires M consecutive successes (recoveryThreshold, default 2).
//
// This prevents a single network blip from opening and closing an
// incident within seconds — the "noisy monitoring" problem.
//
// Example with failureThreshold=2, recoveryThreshold=2:
//
//   Check 1: UP    → status: UP,   consecutiveFailures: 0
//   Check 2: DOWN  → status: UP,   consecutiveFailures: 1  (not enough yet)
//   Check 3: DOWN  → status: DOWN, consecutiveFailures: 2  (threshold hit → incident opens)
//   Check 4: UP    → status: DOWN, consecutiveSuccesses: 1 (not enough yet)
//   Check 5: UP    → status: UP,   consecutiveSuccesses: 2 (threshold hit → incident closes)

export const processCheckResult = (monitor, checkResult) => {
  const {
    failureThreshold   = 2,
    recoveryThreshold  = 2,
    consecutiveFailures  = 0,
    consecutiveSuccesses = 0,
    status: currentStatus,
  } = monitor;

  const checkPassed = checkResult.status === 'UP';
  const checkDegraded = checkResult.status === 'DEGRADED';

  let newConsecutiveFailures  = consecutiveFailures;
  let newConsecutiveSuccesses = consecutiveSuccesses;
  let newStatus               = currentStatus;
  let stateChanged            = false;
  let shouldOpenIncident      = false;
  let shouldCloseIncident     = false;

  if (checkPassed || checkDegraded) {
    // Successful (or degraded-but-alive) check
    newConsecutiveFailures  = 0;
    newConsecutiveSuccesses = consecutiveSuccesses + 1;

    if (currentStatus === 'DOWN' && newConsecutiveSuccesses >= recoveryThreshold) {
      // Monitor has recovered — close the incident
      newStatus          = checkDegraded ? 'DEGRADED' : 'UP';
      stateChanged       = true;
      shouldCloseIncident = true;
    } else if (currentStatus === 'PENDING') {
      // First successful check after creation
      newStatus    = checkDegraded ? 'DEGRADED' : 'UP';
      stateChanged = true;
    } else if (currentStatus === 'UP' && checkDegraded) {
      // Was UP, now degraded
      newStatus    = 'DEGRADED';
      stateChanged = true;
    } else if (currentStatus === 'DEGRADED' && checkPassed) {
      // Recovered from degraded to fully UP
      newStatus    = 'UP';
      stateChanged = true;
    }
  } else {
    // Failed check
    newConsecutiveSuccesses = 0;
    newConsecutiveFailures  = consecutiveFailures + 1;

    if (newConsecutiveFailures >= failureThreshold) {
      if (currentStatus !== 'DOWN') {
        // Monitor just went down — open an incident
        newStatus         = 'DOWN';
        stateChanged      = true;
        shouldOpenIncident = true;
      }
      // If already DOWN, no state change — incident already open
    } else if (currentStatus === 'PENDING') {
      // First check after creation failed — mark as DOWN immediately
      // (don't make users wait for threshold on a brand new monitor)
      newStatus         = 'DOWN';
      stateChanged      = true;
      shouldOpenIncident = true;
    }
  }

  return {
    newStatus,
    newConsecutiveFailures,
    newConsecutiveSuccesses,
    stateChanged,
    shouldOpenIncident,
    shouldCloseIncident,
    // The previous status (useful for logging and notifications)
    previousStatus: currentStatus,
  };
};