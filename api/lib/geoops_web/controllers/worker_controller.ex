defmodule GeoopsWeb.WorkerController do
  use GeoopsWeb, :controller

  alias Geoops.Workers
  alias Geoops.Workers.Worker
  alias Geoops.Tracking.GpsProcessor

  # GET /api/workers
  # Returns all workers with their current cached GPS position (if any).
  def index(conn, _params) do
    workers = Workers.list_workers()
    json(conn, %{data: workers})
  end

  # POST /api/workers
  # Creates a new worker. Expects: { "worker": { "name": ..., "email": ..., ... } }
  def create(conn, %{"worker" => worker_params}) do
    case Workers.create_worker(worker_params) do
      {:ok, %Worker{} = worker} ->
        conn
        |> put_status(:created)
        |> json(%{data: worker})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  # GET /api/workers/:id
  def show(conn, %{"id" => id}) do
    case Workers.get_worker(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Worker not found"})

      worker ->
        json(conn, %{data: worker})
    end
  end

  # PUT/PATCH /api/workers/:id
  # Expects: { "worker": { "name": ..., "status": ..., ... } }
  def update(conn, %{"id" => id, "worker" => worker_params}) do
    case Workers.get_worker(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Worker not found"})

      worker ->
        case Workers.update_worker(worker, worker_params) do
          {:ok, updated} ->
            json(conn, %{data: updated})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
    end
  end

  # DELETE /api/workers/:id
  def delete(conn, %{"id" => id}) do
    case Workers.get_worker(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Worker not found"})

      worker ->
        Workers.delete_worker(worker)
        send_resp(conn, :no_content, "")
    end
  end

  @doc """
  POST /api/workers/:id/gps — Receive a GPS position report from the simulator
  or mobile client.

  Expected body:
    { "latitude": 10.123, "longitude": 106.456 }

  Passes coordinates into GpsProcessor which applies the Kalman filter,
  noise gate, geofence check, and PubSub broadcast.
  """
  def gps_report(conn, %{"id" => worker_id, "latitude" => lat, "longitude" => lng}) do
    case Workers.get_worker(worker_id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Worker not found"})

      worker ->
        GpsProcessor.process(worker_id, worker.name, lat, lng)
        json(conn, %{ok: true})
    end
  end

  # Fallback clause — missing required GPS fields
  def gps_report(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "latitude and longitude required"})
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # Converts an Ecto.Changeset into a plain map of field -> [error strings]
  # suitable for JSON serialisation.
  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
end
