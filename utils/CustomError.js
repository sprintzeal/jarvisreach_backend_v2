class CustomError extends Error {
    constructor(message = "Server Error",statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
    }
}

export default CustomError;
