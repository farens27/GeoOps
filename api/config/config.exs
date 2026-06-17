# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :geoops,
  ecto_repos: [Geoops.Repo],
  generators: [timestamp_type: :utc_datetime]

# Configure the endpoint
config :geoops, GeoopsWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: GeoopsWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Geoops.PubSub,
  live_view: [signing_salt: "hISR0KdR"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Guardian JWT config
config :geoops, GeoopsWeb.Auth.Guardian,
  issuer: "geoops",
  secret_key: System.get_env("JWT_SECRET") || "dev-secret-change-in-prod-min-32-chars-long"

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
