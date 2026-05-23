class AppError extends Error {
	constructor(message, { status = 500, details, code, action } = {}) {
		super(message);
		this.name = this.constructor.name;
		this.status = status;
		this.details = details;
		this.code = code;
		this.action = action;
		this.expose = true;
	}
}

module.exports = {
	AppError,
};
