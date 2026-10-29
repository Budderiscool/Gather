import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const [owner, repository] = (process.env.GITHUB_REPOSITORY || '').split('/');
const isUserOrOrganizationSite = repository?.toLowerCase() === `${owner}.github.io`.toLowerCase();
const base = process.env.GITHUB_ACTIONS === 'true' && repository && !isUserOrOrganizationSite
  ? `/${repository}/`
  : '/';

export default defineConfig({
  plugins: [react()],
  base,
});
