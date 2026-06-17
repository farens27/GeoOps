defmodule GeoopsWeb.Auth.ErrorHandler do
  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  @behaviour Guardian.Plug.ErrorHandler

  @impl Guardian.Plug.ErrorHandler
  def auth_error(conn, {type, _reason}, _opts) do
    message =
      case type do
        :unauthenticated -> "Authentication required"
        :unauthorized -> "You are not authorized to access this resource"
        :invalid_token -> "Invalid or expired token"
        _ -> "Authentication failed"
      end

    conn
    |> put_status(:unauthorized)
    |> json(%{error: message})
  end
end
