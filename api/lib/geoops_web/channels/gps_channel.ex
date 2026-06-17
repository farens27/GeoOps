defmodule GeoopsWeb.GpsChannel do
  @moduledoc """
  WebSocket channel for real-time GPS updates and alerts.

  Clients subscribe and receive:
  - `gps_update`         — a single worker's position has changed
  - `alert`              — geofence enter / exit / breach event
  - `initial_positions`  — snapshot of all current positions on join

  Clients can send:
  - `set_viewport`   — restrict `gps_update` delivery to a lat/lng bounding box
  - `clear_viewport` — remove the bounding-box filter
  - `ping`           — liveness check; replies `{pong: true}`

  All `alert` events bypass viewport filtering and are always delivered.
  """
  use Phoenix.Channel
  require Logger

  alias Geoops.Tracking.WorkerState

  # ---------------------------------------------------------------------------
  # Join
  # ---------------------------------------------------------------------------

  @impl true
  def join("gps:lobby", _payload, socket) do
    # Subscribe this process to the shared PubSub topics that the GPS pipeline
    # and geofence engine broadcast to.
    Phoenix.PubSub.subscribe(Geoops.PubSub, "gps:updates")
    Phoenix.PubSub.subscribe(Geoops.PubSub, "gps:alerts")

    # Defer the initial snapshot push until after join/3 returns so the
    # transport is fully established before we write to it.
    send(self(), :after_join)

    {:ok, socket}
  end

  def join(_topic, _payload, _socket) do
    {:error, %{reason: "unknown topic"}}
  end

  # ---------------------------------------------------------------------------
  # handle_info — async messages from PubSub / self
  # ---------------------------------------------------------------------------

  @impl true
  def handle_info(:after_join, socket) do
    # Push the full current-position snapshot to the newly connected client.
    # WorkerState reads from the ETS position cache, so this is a fast O(n) op.
    positions = WorkerState.get_all_positions()
    push(socket, "initial_positions", %{positions: positions})
    {:noreply, socket}
  end

  @impl true
  def handle_info({:gps_update, payload}, socket) do
    # Only deliver the update if the worker's position falls inside the
    # client's declared viewport bounding box (or if no viewport is set).
    if in_viewport?(payload, socket.assigns[:viewport]) do
      push(socket, "gps_update", payload)
    end

    {:noreply, socket}
  end

  @impl true
  def handle_info({:alert, payload}, socket) do
    # Geofence alerts are always delivered — viewport filtering does not apply.
    push(socket, "alert", payload)
    {:noreply, socket}
  end

  # ---------------------------------------------------------------------------
  # handle_in — messages FROM the client
  # ---------------------------------------------------------------------------

  @impl true
  def handle_in(
        "set_viewport",
        %{"north" => n, "south" => s, "east" => e, "west" => w},
        socket
      ) do
    # Store the bounding box in socket assigns so subsequent gps_update
    # messages can be filtered without any per-message DB/ETS look-up.
    socket = assign(socket, :viewport, %{north: n, south: s, east: e, west: w})
    Logger.debug("GpsChannel: viewport set to N=#{n} S=#{s} E=#{e} W=#{w}")
    {:reply, :ok, socket}
  end

  def handle_in("clear_viewport", _payload, socket) do
    socket = assign(socket, :viewport, nil)
    {:reply, :ok, socket}
  end

  def handle_in("ping", _payload, socket) do
    {:reply, {:ok, %{pong: true}}, socket}
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # No viewport set — let everything through.
  defp in_viewport?(_payload, nil), do: true

  # Worker position is within the rectangular bounding box.
  defp in_viewport?(
         %{latitude: lat, longitude: lng},
         %{north: n, south: s, east: e, west: w}
       ) do
    lat >= s and lat <= n and lng >= w and lng <= e
  end

  # Payload shape doesn't match (e.g., missing lat/lng) — default to deliver.
  defp in_viewport?(_, _), do: true
end
