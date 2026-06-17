defmodule GeoopsWeb.UserSocket do
  @moduledoc """
  Phoenix Socket entry-point for authenticated WebSocket connections.

  ## Authentication

  The client must supply a valid JWT in the `token` connect parameter, e.g.:

      const socket = new Socket("/socket", { params: { token: userToken } })

  Guardian decodes and verifies the token, then loads the associated user.
  The resolved user is stored as `socket.assigns.current_user` for use in
  channels.

  ## Channel routing

      channel "gps:*", GeoopsWeb.GpsChannel

  All topics matching the `gps:*` pattern are routed to `GpsChannel`.
  Currently only `gps:lobby` is used; the wildcard allows future per-team or
  per-worker scoped topics (e.g., `gps:team_01J...`) without socket changes.
  """
  use Phoenix.Socket

  # Route all gps:* topics to the GPS channel.
  channel "gps:*", GeoopsWeb.GpsChannel

  # ---------------------------------------------------------------------------
  # connect/3 — called once per WebSocket upgrade
  # ---------------------------------------------------------------------------

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    # Decode the JWT using Guardian. This verifies the signature, expiry, and
    # any configured claims (issuer, audience, etc.).
    with {:ok, claims} <- GeoopsWeb.Auth.Guardian.decode_and_verify(token),
         {:ok, user} <- GeoopsWeb.Auth.Guardian.resource_from_claims(claims) do
      {:ok, assign(socket, :current_user, user)}
    else
      {:error, reason} ->
        # Log authentication failures at warning level for observability without
        # exposing details to the client.
        require Logger
        Logger.warning("UserSocket: auth failed — #{inspect(reason)}")
        :error

      _ ->
        :error
    end
  end

  # Reject connections that arrive without a token parameter.
  def connect(_params, _socket, _connect_info), do: :error

  # ---------------------------------------------------------------------------
  # id/1 — unique identifier for this socket (used to forcibly disconnect)
  # ---------------------------------------------------------------------------

  @impl true
  # Allows server-side disconnection via:
  #   GeoopsWeb.Endpoint.broadcast("user_socket:#{user.id}", "disconnect", %{})
  def id(socket), do: "user_socket:#{socket.assigns.current_user.id}"
end
