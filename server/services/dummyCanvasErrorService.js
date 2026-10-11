
const SIMULATED_ERRORS = {
    unavailable: {
        status: 503,
        code: "CANVAS_UNAVAILABLE",
        error: "Dummy Canvas service is unavailable",
    },

    timeout: {
        status: 504,
        code: "CANVAS_TIMEOUT",
        error: "Dummy Canvas request timed out",
    },

    rate_limit: {
        status: 429,
        code: "CANVAS_RATE_LIMIT",
        error: "Dummy Canvas rate limit exceeded",
    },
};

// Return an intentionally simulated failure response.
const getSimulatedCanvasError = (errorType) => {
    if (!errorType) {
        return null;
    }

    // Never allow intentional failure simulation in production.
    if (process.env.NODE_ENV === "production") {
        return {
            status: 403,
            code: "SIMULATION_DISABLED",
            error: "Error simulation is disabled in production",
        };
    }

    // Reject unsupported simulation types.
    if (!Object.prototype.hasOwnProperty.call(
        SIMULATED_ERRORS,
        errorType
    )) {
        return {
            status: 400,
            code: "INVALID_SIMULATION",
            error: "Unsupported Dummy Canvas error scenario",
        };
    }

    return SIMULATED_ERRORS[errorType];
};

module.exports = {
    getSimulatedCanvasError,
};
