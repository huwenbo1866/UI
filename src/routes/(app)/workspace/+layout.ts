import { redirect } from '@sveltejs/kit';

export const load = ({ url }) => {
  const p = url.pathname;

  // 访问 /workspace 或 /workspace/ 直接跳到你对外的新入口
  if (p === '/workspace' || p === '/workspace/') {
    throw redirect(302, '/skills');
  }

  // 只允许 skills / knowledge（以及它们的所有子路由，比如 create/edit/[id]）
  const allow =
    p.startsWith('/workspace/skills') ||
    p.startsWith('/workspace/knowledge');

  if (!allow) {
    throw redirect(302, '/skills');
  }

  return {};
};
