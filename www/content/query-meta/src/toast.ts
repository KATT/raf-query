const errors: Array<string> = [];

export const toast = {
	error(message: string) {
		errors.push(message);
	},
};
