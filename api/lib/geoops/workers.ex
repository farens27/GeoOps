defmodule Geoops.Workers do
  @moduledoc "Workers context — CRUD for field workers."

  import Ecto.Query, warn: false
  alias Geoops.Repo
  alias Geoops.Workers.Worker

  def list_workers do
    Repo.all(from w in Worker, order_by: [asc: w.name])
  end

  def list_active_workers do
    Repo.all(from w in Worker, where: w.status == "ACTIVE", order_by: [asc: w.name])
  end

  def get_worker(id) do
    Repo.get(Worker, id)
  end

  def get_worker!(id) do
    Repo.get!(Worker, id)
  end

  def create_worker(attrs \\ %{}) do
    %Worker{}
    |> Worker.changeset(attrs)
    |> Repo.insert()
  end

  def update_worker(%Worker{} = worker, attrs) do
    worker
    |> Worker.changeset(attrs)
    |> Repo.update()
  end

  def delete_worker(%Worker{} = worker) do
    Repo.delete(worker)
  end

  @doc "Update worker GPS position (called from GPS tracker, batched)."
  def update_position(worker_id, latitude, longitude) do
    from(w in Worker, where: w.id == ^worker_id)
    |> Repo.update_all(
      set: [
        latitude: latitude,
        longitude: longitude,
        last_seen: DateTime.utc_now(),
        updated_at: DateTime.utc_now()
      ]
    )
  end

  @doc "Batch update positions for multiple workers at once (cost-efficient)."
  def batch_update_positions(positions) when is_list(positions) do
    Enum.each(positions, fn {worker_id, lat, lng} ->
      update_position(worker_id, lat, lng)
    end)
  end
end
