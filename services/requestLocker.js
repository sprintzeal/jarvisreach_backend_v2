// lockManager.js
const controllerLocks = new Map();

const generateLockKey = (userId, controllerName) => `${controllerName}:${userId}`;

// Lock for specific controller and user
const lockControllerForUser = (userId, controllerName) => {
  const lockKey = generateLockKey(userId, controllerName);

  if (controllerLocks.get(lockKey)) {
    return true; // Lock already exists for this controller and user
  }
  controllerLocks.set(lockKey, true); // Create a lock
  return false;
};

// Unlock for specific controller and user
const unlockControllerForUser = (userId, controllerName) => {
  const lockKey = generateLockKey(userId, controllerName);
  controllerLocks.delete(lockKey); // Release the lock
};

export { lockControllerForUser, unlockControllerForUser };
