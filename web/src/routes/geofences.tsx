import { createSignal, onMount, Show } from 'solid-js';
import { AuthGuard, DataTable, StatusBadge, ConfirmDialog, showToast } from '~/components';
import { api } from '~/lib/api-client';

export default function Geofences() {
  const [geofences, setGeofences] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Modal State
  const [showModal, setShowModal] = createSignal(false);
  const [editingGeofence, setEditingGeofence] = createSignal<any>(null);
  
  // Form State
  const [formData, setFormData] = createSignal({
    name: '',
    description: '',
    zone_type: 'WORK_ZONE',
    color: '#3b82f6',
    is_active: true,
    polygon_coords: '[]' // handled as JSON string in form for simplicity
  });

  // Delete Confirm State
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [geofenceToDelete, setGeofenceToDelete] = createSignal<any>(null);

  const fetchGeofences = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: any[] }>('/api/geofences');
      if (res && res.data) setGeofences(res.data);
    } catch (err) {
      showToast('Failed to fetch geofences', 'error');
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchGeofences);

  const columns = [
    { key: 'name', label: 'Name' },
    { 
      key: 'zone_type', 
      label: 'Type',
      render: (row: any) => <StatusBadge status={row.zone_type} />
    },
    { 
      key: 'color', 
      label: 'Color',
      render: (row: any) => (
        <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
          <div style={{ width: "16px", height: "16px", "border-radius": "50%", background: row.color, border: "1px solid rgba(255,255,255,0.2)" }}></div>
          <span>{row.color}</span>
        </div>
      )
    },
    { 
      key: 'is_active', 
      label: 'Status',
      render: (row: any) => <StatusBadge status={row.is_active ? 'ACTIVE' : 'INACTIVE'} />
    },
    {
      key: 'id',
      label: 'Actions',
      render: (row: any) => (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button 
            class="btn" 
            style={{ padding: "0.25rem 0.5rem", "font-size": "0.75rem", background: "var(--bg-tertiary)" }}
            onClick={() => handleEditClick(row)}
          >
            Edit
          </button>
          <button 
            class="btn btn-danger" 
            style={{ padding: "0.25rem 0.5rem", "font-size": "0.75rem" }}
            onClick={() => handleDeleteClick(row)}
          >
            Delete
          </button>
        </div>
      )
    }
  ];

  const handleEditClick = (geofence: any) => {
    setEditingGeofence(geofence);
    setFormData({
      name: geofence.name,
      description: geofence.description || '',
      zone_type: geofence.zone_type,
      color: geofence.color,
      is_active: geofence.is_active,
      polygon_coords: JSON.stringify(geofence.polygon_coords)
    });
    setShowModal(true);
  };

  const handleAddClick = () => {
    setEditingGeofence(null);
    setFormData({
      name: '',
      description: '',
      zone_type: 'WORK_ZONE',
      color: '#3b82f6',
      is_active: true,
      // Default triangle polygon for a new geofence
      polygon_coords: '[\n  [-122.4194, 37.7749],\n  [-122.4094, 37.7849],\n  [-122.4294, 37.7849]\n]'
    });
    setShowModal(true);
  };

  const handleDeleteClick = (geofence: any) => {
    setGeofenceToDelete(geofence);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!geofenceToDelete()) return;
    try {
      await api.delete(`/api/geofences/${geofenceToDelete().id}`);
      showToast('Geofence deleted successfully', 'success');
      fetchGeofences();
    } catch (err) {
      showToast('Failed to delete geofence', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setGeofenceToDelete(null);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    let parsedCoords;
    try {
      parsedCoords = JSON.parse(formData().polygon_coords);
      if (!Array.isArray(parsedCoords) || parsedCoords.length < 3) {
        throw new Error('Must be an array of at least 3 coordinates');
      }
    } catch (err) {
      showToast('Invalid polygon coordinates JSON format. Must be an array of [lng, lat] pairs.', 'error');
      return;
    }

    const payload = {
      geofence: {
        ...formData(),
        polygon_coords: parsedCoords
      }
    };

    try {
      if (editingGeofence()) {
        await api.put(`/api/geofences/${editingGeofence().id}`, payload);
        showToast('Geofence updated successfully', 'success');
      } else {
        await api.post('/api/geofences', payload);
        showToast('Geofence added successfully', 'success');
      }
      setShowModal(false);
      fetchGeofences();
    } catch (err: any) {
      showToast(err.message || 'Failed to save geofence', 'error');
    }
  };

  return (
    <AuthGuard>
      <div style={{ padding: "2rem" }}>
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "2rem" }}>
          <h1 style={{ "font-size": "2rem", "font-weight": "bold", margin: 0 }}>Geofences</h1>
          <button class="btn btn-primary" onClick={handleAddClick}>+ Add Geofence</button>
        </div>

        <DataTable 
          data={geofences()} 
          columns={columns} 
          loading={loading()} 
          emptyMessage="No geofences found. Add one to get started." 
        />

        {/* Form Modal */}
        <Show when={showModal()}>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", "backdrop-filter": "blur(4px)", "z-index": 50, display: "flex", "align-items": "center", "justify-content": "center", padding: "1rem" }}>
            <div class="card bg-glass border-glass" style={{ width: "100%", "max-width": "600px", padding: "2rem", "max-height": "90vh", "overflow-y": "auto" }}>
              <h2 style={{ "margin-top": 0, "margin-bottom": "1.5rem" }}>
                {editingGeofence() ? 'Edit Geofence' : 'Add Geofence'}
              </h2>
              
              <form onSubmit={handleSubmit}>
                <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "1rem" }}>
                  <div class="form-group">
                    <label>Name</label>
                    <input class="form-input" required value={formData().name} onInput={(e) => setFormData({...formData(), name: e.currentTarget.value})} />
                  </div>
                  <div class="form-group">
                    <label>Zone Type</label>
                    <select class="form-input" value={formData().zone_type} onChange={(e) => setFormData({...formData(), zone_type: e.currentTarget.value})}>
                      <option value="WORK_ZONE">WORK_ZONE</option>
                      <option value="RESTRICTED">RESTRICTED</option>
                      <option value="SAFETY">SAFETY</option>
                      <option value="CUSTOM">CUSTOM</option>
                    </select>
                  </div>
                </div>

                <div class="form-group">
                  <label>Description</label>
                  <input class="form-input" value={formData().description} onInput={(e) => setFormData({...formData(), description: e.currentTarget.value})} />
                </div>

                <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "1rem" }}>
                  <div class="form-group">
                    <label>Color</label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input type="color" style={{ height: "42px", padding: "2px", width: "50px", "border-radius": "4px", border: "1px solid var(--border)", background: "transparent" }} value={formData().color} onInput={(e) => setFormData({...formData(), color: e.currentTarget.value})} />
                      <input class="form-input" value={formData().color} onInput={(e) => setFormData({...formData(), color: e.currentTarget.value})} style={{ flex: 1 }} />
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Status</label>
                    <label style={{ display: "flex", "align-items": "center", gap: "0.5rem", "margin-top": "0.5rem", cursor: "pointer" }}>
                      <input type="checkbox" checked={formData().is_active} onChange={(e) => setFormData({...formData(), is_active: e.currentTarget.checked})} style={{ width: "1.25rem", height: "1.25rem", "accent-color": "var(--primary)" }} />
                      <span>Active</span>
                    </label>
                  </div>
                </div>

                <div class="form-group">
                  <label>Polygon Coordinates (JSON Array of [lng, lat])</label>
                  <textarea 
                    class="form-input" 
                    rows={6} 
                    required 
                    value={formData().polygon_coords} 
                    onInput={(e) => setFormData({...formData(), polygon_coords: e.currentTarget.value})}
                    style={{ "font-family": "monospace", "white-space": "pre" }}
                  />
                  <small style={{ color: "var(--text-secondary)", display: "block", "margin-top": "0.25rem" }}>Must be at least 3 points. Format: [[lng, lat], [lng, lat], ...]</small>
                </div>
                
                <div style={{ display: "flex", "justify-content": "flex-end", gap: "1rem", "margin-top": "2rem" }}>
                  <button type="button" class="btn" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" class="btn btn-primary">Save Geofence</button>
                </div>
              </form>
            </div>
          </div>
        </Show>

        <ConfirmDialog
          isOpen={showDeleteConfirm()}
          title="Delete Geofence"
          message={`Are you sure you want to delete ${geofenceToDelete()?.name}? This cannot be undone.`}
          variant="danger"
          confirmText="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </div>
    </AuthGuard>
  );
}
