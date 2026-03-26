import { WEBUI_API_BASE_URL } from '$lib/constants';

export type WrongQuestionSourceType = 'pack' | 'knowledge' | 'chat';

export interface WrongQuestionRecord {
	id: string;
	user_id: string;
	source_type: WrongQuestionSourceType;
	source_id?: string | null;
	file_id?: string | null;
	chapter?: string | null;
	question_id: string;
	question: string;
	options?: string[] | null;
	correct_answer: string;
	explanation: string;
	last_user_answer: string;
	wrong_count: number;
	first_wrong_at: number;
	last_wrong_at: number;
	created_at?: number;
	updated_at?: number;
}

export interface WrongQuestionListResponse {
	items: WrongQuestionRecord[];
	total: number;
}

export interface UpsertWrongQuestionPayload {
	source_type: WrongQuestionSourceType;
	source_id?: string | null;
	file_id?: string | null;
	chapter?: string | null;
	question_id: string;
	question: string;
	options?: string[] | null;
	correct_answer: string;
	explanation: string;
	last_user_answer: string;
}

interface ListWrongQuestionParams {
	source_type?: WrongQuestionSourceType;
	source_id?: string | null;
	limit?: number;
	offset?: number;
}

function getAuthHeaders(contentType = true): HeadersInit {
	const headers: Record<string, string> = {};
	const token = typeof localStorage !== 'undefined' ? localStorage.token : null;

	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	if (contentType) {
		headers['Content-Type'] = 'application/json';
	}

	return headers;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${WEBUI_API_BASE_URL}${path}`, {
		credentials: 'include',
		...init,
		headers: {
			...getAuthHeaders(!(init.body instanceof FormData)),
			...(init.headers ?? {})
		}
	});

	if (!res.ok) {
		let detail = `HTTP ${res.status}`;
		try {
			const data = await res.json();
			detail = data?.detail ?? detail;
		} catch {
			// ignore
		}
		throw new Error(detail);
	}

	if (res.status === 204) {
		return undefined as T;
	}

	return (await res.json()) as T;
}

export async function listWrongQuestions(
	params: ListWrongQuestionParams = {}
): Promise<WrongQuestionListResponse> {
	const search = new URLSearchParams();
	if (params.source_type) search.set('source_type', params.source_type);
	if (params.source_id) search.set('source_id', params.source_id);
	if (typeof params.limit === 'number') search.set('limit', String(params.limit));
	if (typeof params.offset === 'number') search.set('offset', String(params.offset));

	const suffix = search.toString() ? `?${search.toString()}` : '';

	return request<WrongQuestionListResponse>(
		`/knowledge-defense/wrong-questions${suffix}`,
		{
			method: 'GET'
		}
	);
}

export async function upsertWrongQuestion(
	payload: UpsertWrongQuestionPayload
): Promise<WrongQuestionRecord> {
	return request<WrongQuestionRecord>('/knowledge-defense/wrong-questions', {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

export async function deleteWrongQuestion(id: string): Promise<void> {
	await request<void>(
		`/knowledge-defense/wrong-questions/${encodeURIComponent(id)}`,
		{
			method: 'DELETE'
		}
	);
}

export async function clearWrongQuestions(
	source_type?: WrongQuestionSourceType,
	source_id?: string | null
): Promise<void> {
	const search = new URLSearchParams();
	if (source_type) search.set('source_type', source_type);
	if (source_id) search.set('source_id', source_id);

	const suffix = search.toString() ? `?${search.toString()}` : '';

	await request<void>(`/knowledge-defense/wrong-questions${suffix}`, {
		method: 'DELETE'
	});
}