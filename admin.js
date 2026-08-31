if (localStorage.getItem("isAdmin") !== "true") {
  window.location.href = "admin-login.html";
}

async function syncFromBusy() {
  document.getElementById("sync-message").textContent = "Syncing...";

  const response = await fetch('http://localhost:3000/api/sync-from-busy', {
    method: 'POST'
  });
  const result = await response.json();

  document.getElementById("sync-message").textContent = result.message;
}

async function uploadCatalog() {
  const fileInput = document.getElementById("csv-file");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a CSV file first");
    return;
  }

  const formData = new FormData();
  formData.append("catalogFile", file);

  document.getElementById("upload-message").textContent = "Uploading...";

  const response = await fetch('http://localhost:3000/api/upload-catalog', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  document.getElementById("upload-message").textContent = result.message;
}

async function loadOrders() {
  const response = await fetch('http://localhost:3000/api/orders');
  const orders = await response.json();

  let html = "";

  for (let i = 0; i < orders.length; i++) {
    let order = orders[i];
    let items = JSON.parse(order.items);

    let itemsHtml = "";
    for (let j = 0; j < items.length; j++) {
      itemsHtml += items[j].name + " (\u20B9" + items[j].price + ")<br>";
    }

    html += "<div class='order-card'>";
    html += "<h3>Order #" + order.id + "</h3>";
    html += "<p class='meta'>" + order.created_at + "</p>";
    html += "<p>" + itemsHtml + "</p>";
    html += "<p class='price'>Total: \u20B9" + order.total + "</p>";
    html += "<label>Status: </label>";
    html += "<select onchange=\"updateStatus(" + order.id + ", this.value)\">";
    html += "<option value='Pending'" + (order.status === "Pending" ? " selected" : "") + ">Pending</option>";
    html += "<option value='Dispatched'" + (order.status === "Dispatched" ? " selected" : "") + ">Dispatched</option>";
    html += "<option value='Delivered'" + (order.status === "Delivered" ? " selected" : "") + ">Delivered</option>";
    html += "</select>";
    html += "</div>";
  }

  document.getElementById("orders-list").innerHTML = html;
}
async function updateStatus(orderId, newStatus) {
  await fetch('/api/orders/' + orderId + '/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
  });
  alert("Status updated to: " + newStatus);
}

// Function to open Edit Modal with existing product data
function openEditProductModal(product) {
  document.getElementById('editProductId').value = product.id;
  document.getElementById('editProductName').value = product.name;
  document.getElementById('editProductCategory').value = product.category;
  document.getElementById('editProductPrice').value = product.price;
  document.getElementById('editProductMoq').value = product.moq;
  document.getElementById('editProductUnit').value = product.unit;
  
  const imgTag = document.getElementById('editImageTag');
  imgTag.src = product.image ? '/' + product.image : '/images/placeholder.png';

  document.getElementById('editProductModal').style.display = 'block';
}

function closeEditModal() {
  document.getElementById('editProductModal').style.display = 'none';
}

// Handle Form Submission with Multipart FormData (File Upload)
document.getElementById('editProductForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editProductId').value;
  const formData = new FormData(e.target);

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      body: formData
    });

    const data = await res.json();
    if (res.ok) {
      alert('Product & Image updated successfully!');
      closeEditModal();
      if (typeof loadAdminProducts === 'function') {
        loadAdminProducts();
      } else {
        location.reload();
      }
    } else {
      alert('Error: ' + (data.error || 'Failed to update'));
    }
  } catch (err) {
    console.error(err);
    alert('Something went wrong while updating image.');
  }
});

loadOrders();
