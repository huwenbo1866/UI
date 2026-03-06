import { WEBUI_API_BASE_URL } from '$lib/constants';

export type DifficultyConfig = {
	easy: number;
	medium: number;
	hard: number;
};

export type GenerateHomeworkPayload = {
	title?: string;
	source_file_id?: string;
	source_content?: string;
	description?: string;
	difficulty_config?: DifficultyConfig;
	question_types?: string[];
	model?: string;
};

export type SubmitHomeworkPayload = {
	homework_id: string;
	answers: { question_id: string; answer: string }[];
	model?: string;
};

export const listHomeworks = async (token: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/homework/`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			authorization: `Bearer ${token}`
		}
	})
		.then(async (response) => {
			if (!response.ok) throw await response.json();
			return response.json();
		})
		.catch((err) => {
			error = err?.detail ?? err?.message ?? 'Failed to list homeworks';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getHomeworkById = async (token: string, homeworkId: string) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/homework/${homeworkId}`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			authorization: `Bearer ${token}`
		}
	})
		.then(async (response) => {
			if (!response.ok) throw await response.json();
			return response.json();
		})
		.catch((err) => {
			error = err?.detail ?? err?.message ?? 'Failed to get homework';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const generateHomework = async (token: string, payload: GenerateHomeworkPayload) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/homework/generate`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			authorization: `Bearer ${token}`
		},
		body: JSON.stringify(payload)
	})
		.then(async (response) => {
			if (!response.ok) throw await response.json();
			return response.json();
		})
		.catch((err) => {
			error = err?.detail ?? err?.message ?? 'Failed to generate homework';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const submitHomework = async (token: string, payload: SubmitHomeworkPayload) => {
	let error = null;

	const res = await fetch(`${WEBUI_API_BASE_URL}/homework/submit`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			authorization: `Bearer ${token}`
		},
		body: JSON.stringify(payload)
	})
		.then(async (response) => {
			if (!response.ok) throw await response.json();
			return response.json();
		})
		.catch((err) => {
			error = err?.detail ?? err?.message ?? 'Failed to submit homework';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};
