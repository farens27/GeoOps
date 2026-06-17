defmodule Geoops.Repo do
  use Ecto.Repo,
    otp_app: :geoops,
    adapter: Ecto.Adapters.Postgres
end
