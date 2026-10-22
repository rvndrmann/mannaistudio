import nextConfig from "eslint-config-next"

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", "supabase/.temp/**", "netlify/functions/**", "editor/**", ".cache/**", "public/editor/**"],
  },
]

export default config
