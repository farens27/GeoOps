defmodule GeoopsWeb.Router do
  use GeoopsWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :auth do
    plug GeoopsWeb.Auth.Pipeline
  end

  # Public routes (no auth)
  scope "/", GeoopsWeb do
    pipe_through :api

    get "/", RootController, :index
  end

  scope "/api", GeoopsWeb do
    pipe_through :api

    post "/auth/login", AuthController, :login
    post "/auth/logout", AuthController, :logout
  end

  # Protected routes (require valid JWT)
  scope "/api", GeoopsWeb do
    pipe_through [:api, :auth]

    # Auth
    get "/auth/me", AuthController, :me

    # Workers
    resources "/workers", WorkerController, except: [:new, :edit]
    post "/workers/:id/gps", WorkerController, :gps_report

    # Geofences
    resources "/geofences", GeofenceController, except: [:new, :edit]

    # Alerts / Events
    get "/alerts", AlertController, :index
    get "/alerts/worker/:worker_id", AlertController, :by_worker

    # Dashboard stats
    get "/dashboard/stats", DashboardController, :stats
  end
end
