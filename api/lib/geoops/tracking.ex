defmodule Geoops.Tracking do
  @moduledoc "Tracking context — geo events and alert management."

  import Ecto.Query, warn: false
  alias Geoops.Repo
  alias Geoops.Tracking.GpsEvent

  def list_recent_events(limit \\ 50) do
    Repo.all(
      from e in GpsEvent,
        order_by: [desc: e.detected_at],
        limit: ^limit
    )
  end

  def list_events_for_worker(worker_id, limit \\ 20) do
    Repo.all(
      from e in GpsEvent,
        where: e.worker_id == ^worker_id,
        order_by: [desc: e.detected_at],
        limit: ^limit
    )
  end

  def create_event(attrs) do
    attrs = Map.put_new(attrs, :detected_at, DateTime.utc_now())

    %GpsEvent{}
    |> GpsEvent.changeset(attrs)
    |> Repo.insert()
  end
end
