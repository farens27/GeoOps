defmodule GeoopsWeb.GeofenceController do
  use GeoopsWeb, :controller

  alias Geoops.Geofences
  alias Geoops.Geofences.Geofence
  alias Geoops.Tracking.GeofenceCache

  # GET /api/geofences
  # Returns all geofences (simplified polygon vertices included).
  def index(conn, _params) do
    geofences = Geofences.list_geofences()
    json(conn, %{data: geofences})
  end

  # POST /api/geofences
  # Expects: { "geofence": { "name": ..., "vertices": [...], ... } }
  # On success, immediately refreshes the in-memory GeofenceCache so new
  # boundaries take effect without waiting for the 5-minute periodic refresh.
  def create(conn, %{"geofence" => params}) do
    case Geofences.create_geofence(params) do
      {:ok, %Geofence{} = geofence} ->
        GeofenceCache.refresh()
        conn |> put_status(:created) |> json(%{data: geofence})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  # GET /api/geofences/:id
  def show(conn, %{"id" => id}) do
    case Geofences.get_geofence(id) do
      nil -> conn |> put_status(:not_found) |> json(%{error: "Geofence not found"})
      geofence -> json(conn, %{data: geofence})
    end
  end

  # PUT/PATCH /api/geofences/:id
  # After update, refreshes the cache so the new polygon is live immediately.
  def update(conn, %{"id" => id, "geofence" => params}) do
    case Geofences.get_geofence(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Geofence not found"})

      geofence ->
        case Geofences.update_geofence(geofence, params) do
          {:ok, updated} ->
            GeofenceCache.refresh()
            json(conn, %{data: updated})

          {:error, changeset} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{errors: format_errors(changeset)})
        end
    end
  end

  # DELETE /api/geofences/:id
  # Removes the record and purges it from the in-memory cache immediately.
  def delete(conn, %{"id" => id}) do
    case Geofences.get_geofence(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Geofence not found"})

      geofence ->
        Geofences.delete_geofence(geofence)
        GeofenceCache.refresh()
        send_resp(conn, :no_content, "")
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
end
