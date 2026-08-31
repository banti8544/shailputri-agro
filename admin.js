if (localStorage.getItem("isAdmin") !== "true") {
  window.location.href = "admin-login.html";
}

// 1. Orders Management
async function loadOrders() {
  try {
    const response = await fetch('/api/orders');
    const orders = await response.json();

    let html = "";
    if (orders.length === 0) {
      document.getElementById("orders-list").innerHTML = "<p>No orders found.</p>";
      return;
    }

    for (let i = 0; i < orders.length; i++) {
      let order = orders[i];
      let items = [];
      try {
        items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      } catch (e) {
        items = [];
      }

      let itemsHtml = "";
      for (let j = 0; j < items.length; j++) {
        itemsHtml += (items[j].name || 'Product') + " (₹" + (items[j].price || 0) + ")<br>";
      }

      html += "<div class='order-card' style='border: 1px solid #ddd; padding: 12px; margin-bottom: 12px; border-radius: 6px;'>";
      html += "<h3>Order #" + order.id + "</h3>";
      html += "<p class='meta'>" + (order.created_at || '') + "</p>";
      html += "<p>" + itemsHtml + "</p>";
      html += "<p class='price'><strong>Total: ₹" + order.total + "</strong></p>";
      html += "<label>Status: </label>";
      html += "<select onchange=\"updateStatus(" + order.id + ", this.value)\">";
      html += "<option value='Pending'" + (order.status === "Pending" ? " selected" : "") + ">Pending</option>";
      html += "<option value='Dispatched'" + (order.status === "Dispatched" ? " selected" : "") + ">Dispatched</option>";
      html += "<option value='Delivered'" + (order.status === "Delivered" ? " selected" : "") + ">Delivered</option>";
      html += "</select>";
      html += "</div>";
    }

    const orderContainer = document.getElementById("orders-list");
    if (orderContainer) orderContainer.innerHTML = html;
  } catch (err) {
    console.error("Error loading orders:", err);
  }
}

async function updateStatus(orderId, newStatus) {
  try {
    await fetch('/api/orders/' + orderId + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    alert("Status updated to: " + newStatus);
  } catch (err) {
    alert("Failed to update status");
  }
}

// 2. Manage Products & Image Upload
async function loadAdminProducts() {
  const tableBody = document.getElementById("admin-products-table");
  if (!tableBody) return;

  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    const products = data.products || [];

    if (products.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No products found.</td></tr>';
      return;
    }

    tableBody.innerHTML = products.map(p => {
      const imgPath = p.imageUrl ? '/' + p.imageUrl : '/images/placeholder.png';
      return `
        <tr id="row-${p.id}">
          <td>${p.id}</td>
          <td><strong>${p.name}</strong></td>
          <td>${p.sku || '-'}</td>
          <td><input type="text" id="hsn-${p.id}" value="${p.hsn || '1006'}" style="width: 75px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;"></td>
          <td>
            <select id="gst-${p.id}" style="padding: 4px; border: 1px solid #ccc; border-radius: 4px;">
              <option value="0" ${p.gst_rate == 0 ? 'selected' : ''}>0%</option>
              <option value="5" ${p.gst_rate == 5 ? 'selected' : ''}>5%</option>
              <option value="12" ${p.gst_rate == 12 ? 'selected' : ''}>12%</option>
              <option value="18" ${p.gst_rate == 18 ? 'selected' : ''}>18%</option>
            </select>
          </td>
          <td><input type="number" id="price-${p.id}" value="${p.price || 0}" style="width: 80px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;"></td>
          <td><input type="number" id="stock-${p.id}" value="${p.stock ?? 0}" style="width: 70px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;"></td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${imgPath}" id="preview-${p.id}" style="width: 38px; height: 38px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc;">
              <input type="file" id="file-${p.id}" accept="image/*" style="font-size: 11px; width: 135px;" onchange="previewProductImage(event, ${p.id})">
            </div>
          </td>
          <td>
            <button class="btn btn-sm btn-success" style="background:#28a745; color:#fff; border:none; padding: 5px 10px; border-radius:4px; cursor:pointer;" onclick="saveProductRow(${p.id}, '${p.name.replace(/'/g, "\\'")}', '${(p.category || 'General').replace(/'/g, "\\'")}')">Save</button>
            <button class="btn btn-sm btn-danger" style="background:#dc3545; color:#fff; border:none; padding: 5px 10px; border-radius:4px; cursor:pointer;" onclick="deleteProductRow(${p.id})">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Error loading products:", err);
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:red;">Failed to load products.</td></tr>';
  }
}

// Live Image Preview before save
function previewProductImage(event, id) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById(`preview-${id}`);
      if (img) img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

// Save Product & Upload Image
async function saveProductRow(id, name, category) {
  const price = document.getElementById(`price-${id}`).value;
  const stock = document.getElementById(`stock-${id}`).value;
  const hsn = document.getElementById(`hsn-${id}`).value;
  const gst_rate = document.getElementById(`gst-${id}`).value;
  const fileInput = document.getElementById(`file-${id}`);

  const formData = new FormData();
  formData.append('name', name);
  formData.append('category', category);
  formData.append('price', price);
  formData.append('stock', stock);
  formData.append('hsn', hsn);
  formData.append('gst_rate', gst_rate);

  if (fileInput && fileInput.files && fileInput.files[0]) {
    formData.append('image', fileInput.files[0]);
  }

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      body: formData
    });
    const result = await res.json();
    if (result.success) {
      alert('Product & Image updated successfully!');
      loadAdminProducts();
    } else {
      alert('Error: ' + (result.message || result.error || 'Failed to update'));
    }
  } catch (err) {
    console.error(err);
    alert('Failed to save changes.');
  }
}

// Delete Product
async function deleteProductRow(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      alert('Product deleted successfully');
      loadAdminProducts();
    }
  } catch (err) {
    alert('Failed to delete product');
  }
}

// Initial Calls
loadOrders();
loadAdminProducts();
