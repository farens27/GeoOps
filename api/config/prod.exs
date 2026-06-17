import Config

config :geoops, GeoopsWeb.Endpoint,
  url: [host: System.get_env("PHX_HOST") || "example.com", port: 443, scheme: "https"],
  http: [port: {:system, "PORT"}],
  secret_key_base: System.fetch_env!("SECRET_KEY_BASE"),
  server: true

config :geoops, Geoops.Repo,
  url: System.fetch_env!("DATABASE_URL"),
  pool_size: String.to_integer(System.get_env("POOL_SIZE") || "5"),
  ssl: true,
  ssl_opts: [verify: :verify_none]

config :logger, level: :info
