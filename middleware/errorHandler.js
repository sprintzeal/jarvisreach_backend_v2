 const errorHandler = (err, req, res, next) => {

    const errStatus = err.statusCode || 500;
    const errMsg = err.message || 'Something went wrong';
    res.status(errStatus).json({
        success: false,
        status: errStatus,
        message: errMsg,
        stack: process.env.NODE_ENV === 'production' ? {} : err.stack
    })
}

export default errorHandler