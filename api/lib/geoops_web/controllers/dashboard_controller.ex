defmodule GeoopsWeb.DashboardController do
  use GeoopsWeb, :controller

  import Ecto.Query

  alias Geoops.Repo
  alias Geoops.Workers.Worker
  alias Geoops.Geofences.Geofence
  alias Geoops.Tracking.GpsEvent

  @doc """
  GET /api/dashboard/stats

  Returns high-level aggregate statistics for the operations dashboard:

    - total_workers      — total number of worker records
    - active_workers     — workers whose status == "ACTIVE"
    - total_geofences    — total number of geofence zones
    - recent_breaches    — geofence BREACH events in the last 24 hours

  All counts are computed with single DB aggregate queries (no ORM N+1).
  """
  def stats(conn, _params) do
    total_workers =
      Repo.aggregate(Worker, :count, :id)

    active_workers =
      Repo.aggregate(
        from(w in Worker, where: w.status == "ACTIVE"),
        :count,
        :id
      )

    total_geofences =
      Repo.aggregate(Geofence, :count, :id)

    recent_breaches =
      Repo.aggregate(
        from(e in GpsEvent,
          where:
            e.event_type == "BREACH" and
              e.detected_at > ago(24, "hour")
        ),
        :count,
        :id
      )

    json(conn, %{
      data: %{
        total_workers: total_workers,
        active_workers: active_workers,
        total_geofences: total_geofences,
        recent_breaches: recent_breaches
      }
    })
  end
end
