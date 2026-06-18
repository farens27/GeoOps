defmodule Geoops.Tracking.GpsProcessor do
  @moduledoc """
  Core GPS event processor — stateless module called on every incoming report.

  ## Pipeline (per GPS report)

  1. **Noise gate** — discard GPS jitter (< 3 m) and impossible spikes (> 1 000 m).
  2. **ETS position update** — store `{lat, lng, ts}` in `:worker_positions`; zero DB cost.
  3. **In-memory geofence check** — ray-casting against cached polygon list; zero DB cost.
  4. **Zone-change events** — compare current zones vs previous zones; write ENTERED /
     EXITED / BREACH records to DB *immediately* (not batched) on state change.
  5. **PubSub broadcast** — push position update to all connected WebSocket clients.

  ## Geofence event types

  | Situation                   | Event type |
  |-----------------------------|------------|
  | Enter any geofence          | `ENTERED`  |
  | Enter a RESTRICTED geofence | `BREACH`   |
  | Leave any geofence          | `EXITED`   |

  ## Noise gate thresholds

  | Parameter            | Value   | Rationale                          |
  |----------------------|---------|------------------------------------|
  | `@min_distance_meters` | 3 m   | Filters GPS jitter while at rest   |
  | `@max_distance_meters` | 1 000 m | Rejects impossible GPS spikes    |
  """
  require Logger

  alias Geoops.Tracking.{GeofenceCache, WorkerState}
  alias Geoops.Tracking

  # ------------------------------------------------------------------
  # Noise-gate thresholds
  # ------------------------------------------------------------------
  @min_distance_meters 3
  @max_distance_meters 1_000

  # ------------------------------------------------------------------
  # Public API
  # ------------------------------------------------------------------

  @doc """
  Process a single GPS report for `worker_id`.

  Returns `:processed` when the position was accepted and broadcast, or
  `:ignored` when the noise gate filtered it out.
  """
  def process(worker_id, worker_name, lat, lng) do
    case noise_gate(worker_id, lat, lng) do
      :ignore ->
        :ignored

      :accept ->
        # --- Step 2: ETS write (zero DB cost) ---
        WorkerState.update_position(worker_id, lat, lng)

        # --- Step 3: In-memory geofence check ---
        current_zones = check_geofences_in_memory(lat, lng)
        previous_zones = WorkerState.get_worker_zones(worker_id)

        # --- Step 4: Persist zone-change events immediately ---
        handle_zone_changes(worker_id, worker_name, current_zones, previous_zones, lat, lng)
        WorkerState.update_worker_zones(worker_id, current_zones)

        # --- Step 5: Broadcast position to WebSocket clients ---
        Phoenix.PubSub.broadcast(
          Geoops.PubSub,
          "gps:updates",
          {:gps_update,
           %{
             worker_id: worker_id,
             name: worker_name,
             latitude: lat,
             longitude: lng,
             timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
           }}
        )

        :processed
    end
  end

  # ------------------------------------------------------------------
  # Noise gate
  # ------------------------------------------------------------------

  # Accept the first position from an unseen worker immediately.
  # For subsequent positions: reject if movement is < 3 m (jitter) or
  # > 1 000 m (GPS spike / bad fix).
  defp noise_gate(worker_id, new_lat, new_lng) do
    case WorkerState.get_position(worker_id) do
      :not_found ->
        :accept

      {:ok, old_lat, old_lng, _ts} ->
        dist = haversine(old_lat, old_lng, new_lat, new_lng)

        cond do
          dist < @min_distance_meters -> :ignore
          dist > @max_distance_meters -> :ignore
          true -> :accept
        end
    end
  end

  # ------------------------------------------------------------------
  # Geofence check (pure in-memory)
  # ------------------------------------------------------------------

  defp check_geofences_in_memory(lat, lng) do
    GeofenceCache.get_all()
    |> Enum.filter(fn g -> point_in_polygon?({lat, lng}, g.polygon_coords) end)
    |> Enum.map(fn g -> g.id end)
    |> MapSet.new()
  end

  # ------------------------------------------------------------------
  # Zone-change event handling
  # ------------------------------------------------------------------

  defp handle_zone_changes(worker_id, worker_name, current_zones, previous_zones, lat, lng) do
    entered = MapSet.difference(current_zones, previous_zones)
    exited = MapSet.difference(previous_zones, current_zones)

    # Build a lookup map so we can resolve zone metadata without iterating
    # the full cache list for every event.
    geofence_map =
      GeofenceCache.get_all()
      |> Map.new(fn g -> {g.id, g} end)

    # ENTERED / BREACH events
    Enum.each(entered, fn zone_id ->
      geofence = Map.get(geofence_map, zone_id)

      # Workers entering a RESTRICTED zone produce a BREACH alert instead of
      # a plain ENTERED event so dispatch channels can apply different routing.
      event_type =
        if geofence && geofence.zone_type == "RESTRICTED",
          do: "BREACH",
          else: "ENTERED"

      case Tracking.create_event(%{
             worker_id: worker_id,
             geofence_id: zone_id,
             event_type: event_type,
             latitude: lat,
             longitude: lng
           }) do
        {:ok, event} ->
          Logger.info(
            "GpsProcessor: Worker '#{worker_name}' (ID: #{worker_id}) triggered #{event_type} on geofence '#{geofence && geofence.name}' (ID: #{zone_id}) at [#{lat}, #{lng}]"
          )
          broadcast_alert(event, geofence, worker_name)

        {:error, reason} ->
          Logger.warning(
            "Failed to create geo_event (worker=#{worker_id}, zone=#{zone_id}): #{inspect(reason)}"
          )
      end
    end)

    # EXITED events — broadcast so clients can update map overlays.
    Enum.each(exited, fn zone_id ->
      geofence = Map.get(geofence_map, zone_id)

      case Tracking.create_event(%{
             worker_id: worker_id,
             geofence_id: zone_id,
             event_type: "EXITED",
             latitude: lat,
             longitude: lng
           }) do
        {:ok, event} ->
          Logger.info(
            "GpsProcessor: Worker '#{worker_name}' (ID: #{worker_id}) triggered EXITED on geofence '#{geofence && geofence.name}' (ID: #{zone_id}) at [#{lat}, #{lng}]"
          )
          broadcast_alert(event, geofence, worker_name)

        {:error, reason} ->
          Logger.warning(
            "Failed to create EXITED event (worker=#{worker_id}, zone=#{zone_id}): #{inspect(reason)}"
          )
      end
    end)
  end

  defp broadcast_alert(event, geofence, worker_name) do
    Phoenix.PubSub.broadcast(
      Geoops.PubSub,
      "gps:alerts",
      {:alert,
       %{
         id: event.id,
         worker_id: event.worker_id,
         worker_name: worker_name,
         geofence_id: event.geofence_id,
         geofence_name: geofence && geofence.name,
         event_type: event.event_type,
         latitude: event.latitude,
         longitude: event.longitude,
         detected_at: event.detected_at |> DateTime.to_iso8601()
       }}
    )
  end

  # ------------------------------------------------------------------
  # Geometry helpers
  # ------------------------------------------------------------------

  # Haversine great-circle distance in metres.
  # Accurate to ~0.5% over the distances used here (< 2 km).
  defp haversine(lat1, lng1, lat2, lng2) do
    r = 6_371_000
    phi1 = lat1 * :math.pi() / 180
    phi2 = lat2 * :math.pi() / 180
    dphi = (lat2 - lat1) * :math.pi() / 180
    dlambda = (lng2 - lng1) * :math.pi() / 180

    a =
      :math.sin(dphi / 2) * :math.sin(dphi / 2) +
        :math.cos(phi1) * :math.cos(phi2) *
          :math.sin(dlambda / 2) * :math.sin(dlambda / 2)

    c = 2 * :math.atan2(:math.sqrt(a), :math.sqrt(1 - a))
    r * c
  end

  # Ray-casting point-in-polygon (Jordan curve theorem).
  #
  # `polygon_coords` is a list of `[lng, lat]` pairs (GeoJSON order) matching
  # the storage format in the geofences table.
  #
  # The algorithm toggles `inside` each time a ray from the test point crosses
  # a polygon edge, returning true when the final count is odd.
  #
  # Requires at least 3 vertices; returns false for degenerate polygons.
  defp point_in_polygon?({lat, lng}, polygon_coords)
       when is_list(polygon_coords) and length(polygon_coords) >= 3 do
    # Build consecutive vertex pairs: [v0,v1], [v1,v2], ..., [vN-1,v0]
    # chunk_every/4 with :discard gives us overlapping pairs from [v0..vN-1];
    # we seed the reducer with the *last* vertex as the initial `prev`.
    polygon_coords
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.reduce({false, List.last(polygon_coords)}, fn [curr | _], {inside, prev} ->
      # GeoJSON stores coords as [longitude, latitude]
      [cx, cy] = curr
      [px, py] = prev

      intersects =
        cy > lat != py > lat and
          lng < (px - cx) * (lat - cy) / (py - cy) + cx

      {if(intersects, do: !inside, else: inside), curr}
    end)
    |> elem(0)
  end

  defp point_in_polygon?(_, _), do: false
end
