import Config

if config_env() == :prod do
  database_url = System.fetch_env!("DATABASE_URL")
  secret_key_base = System.fetch_env!("SECRET_KEY_BASE")
  jwt_secret = System.fetch_env!("JWT_SECRET")

  config :geoops, GeoopsWeb.Auth.Guardian,
    secret_key: jwt_secret

  config :geoops, Geoops.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "5"),
    ssl: true,
    ssl_opts: [verify: :verify_none]

  config :geoops, GeoopsWeb.Endpoint,
    http: [ip: {0, 0, 0, 0}, port: String.to_integer(System.get_env("PORT") || "4000")],
    secret_key_base: secret_key_base,
    server: true
end
