defmodule GeoopsWeb.AuthController do
  use GeoopsWeb, :controller

  alias Geoops.Accounts
  alias GeoopsWeb.Auth.Guardian

  @doc "POST /api/auth/login"
  def login(conn, %{"username" => username, "password" => password}) do
    case Accounts.authenticate(username, password) do
      {:ok, user} ->
        {:ok, token, _claims} = Guardian.encode_and_sign(user, %{}, ttl: {24, :hours})

        conn
        |> put_status(:ok)
        |> json(%{
          token: token,
          user: %{
            id: user.id,
            username: user.username,
            role: user.role
          }
        })

      {:error, :invalid_credentials} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Invalid username or password"})
    end
  end

  def login(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "username and password are required"})
  end

  @doc "POST /api/auth/logout"
  def logout(conn, _params) do
    conn
    |> put_status(:ok)
    |> json(%{message: "Logged out successfully"})
  end

  @doc "GET /api/auth/me"
  def me(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    conn
    |> put_status(:ok)
    |> json(%{
      id: user.id,
      username: user.username,
      role: user.role
    })
  end
end
