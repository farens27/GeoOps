defmodule GeoopsWeb.AlertController do
  use GeoopsWeb, :controller

  alias Geoops.Tracking

  @default_limit 50
  @worker_default_limit 20

  # GET /api/alerts?limit=N
  # Returns the N most recent geofence events (ENTER / EXIT / BREACH) across
  # all workers.  Defaults to 50 if no limit query param is supplied.
  def index(conn, params) do
    limit =
      params
      |> Map.get("limit", to_string(@default_limit))
      |> String.to_integer()

    events = Tracking.list_recent_events(limit)
    json(conn, %{data: events})
  end

  # GET /api/alerts/worker/:worker_id?limit=N
  # Returns the N most recent events for a specific worker.
  # Defaults to 20 if no limit query param is supplied.
  def by_worker(conn, %{"worker_id" => worker_id} = params) do
    limit =
      params
      |> Map.get("limit", to_string(@worker_default_limit))
      |> String.to_integer()

    events = Tracking.list_events_for_worker(worker_id, limit)
    json(conn, %{data: events})
  end
end
