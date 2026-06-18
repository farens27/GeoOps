defmodule GeoopsWeb.RootController do
  use GeoopsWeb, :controller

  # GET /
  def index(conn, _params) do
    json(conn, %{
      status: "ok",
      message: "GeoOps Field Operations Command Center API is running",
      version: "0.1.0"
    })
  end
end
