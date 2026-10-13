import nextConfig from "eslint-config-next"

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", "supabase/.temp/**", "netlify/functions/**"],
  },
]

export default config
