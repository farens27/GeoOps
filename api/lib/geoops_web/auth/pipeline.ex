defmodule GeoopsWeb.Auth.Pipeline do
  use Guardian.Plug.Pipeline,
    otp_app: :geoops,
    module: GeoopsWeb.Auth.Guardian,
    error_handler: GeoopsWeb.Auth.ErrorHandler

  plug Guardian.Plug.VerifyHeader, scheme: "Bearer"
  plug Guardian.Plug.EnsureAuthenticated
  plug Guardian.Plug.LoadResource, allow_blank: false
end
