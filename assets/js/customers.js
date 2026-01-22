const Customers = {
  currentCustomer: null,
  init: () => {
    Customers.renderList();
    Customers.setupEventListeners();
  },
  setupEventListeners: () => {
    document.getElementById('newCustomer').addEventListener('click', () => Customers.openModal());
    document.getElementById('customerSearch').addEventListener('input', (e) => Customers.filterCustomers(e.target.value));
    document.getElementById('customerForm').addEventListener('submit', (e) => { e.preventDefault(); Customers.saveCustomer(); });
    document.querySelectorAll('.modal .close').forEach(btn => {
      btn.addEventListener('click', (e) => { e.target.closest('.modal').style.display = 'none'; });
    });
    const list = document.getElementById('customerList');
    if (list) list.addEventListener('click', Customers.handleListClick);
  },
  renderList: (filter = '') => {
    const list = document.getElementById('customerList');
    const customers = Storage.customers.getAll();
    const filtered = filter
      ? customers.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) || (c.email && c.email.toLowerCase().includes(filter.toLowerCase())))
      : customers;
    if (filtered.length === 0) {
      list.innerHTML = '<p class="empty-state">No customers found. Click "+ New Customer" to add one.</p>';
      return;
    }
    list.innerHTML = filtered.map(customer => `
      <div class="customer-item" data-id="${customer.id}">
        <div class="customer-item-header">
          <h4>${Utils.escapeHtml(customer.name)}</h4>
          <div class="customer-actions">
            <button class="btn-icon" data-action="select" data-id="${customer.id}" title="Select">Select</button>
            <button class="btn-icon" data-action="edit" data-id="${customer.id}" title="Edit">Edit</button>
            <button class="btn-icon" data-action="delete" data-id="${customer.id}" title="Delete">Delete</button>
          </div>
        </div>
        <div class="customer-item-details">
          ${customer.email ? `<div>Email: ${Utils.escapeHtml(customer.email)}</div>` : ''}
          ${customer.phone ? `<div>Phone: ${Utils.escapeHtml(customer.phone)}</div>` : ''}
          ${customer.address ? `<div>Address: ${Utils.escapeHtml(customer.address)}</div>` : ''}
        </div>
      </div>
    `).join('');
  },
  handleListClick: (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    if (action === 'select') Customers.selectCustomer(id);
    if (action === 'edit') Customers.editCustomer(id);
    if (action === 'delete') Customers.deleteCustomer(id);
  },
  filterCustomers: (search) => { Customers.renderList(search); },
  openModal: (customerId = null) => {
    const modal = document.getElementById('customerModal');
    const form = document.getElementById('customerForm');
    const title = document.getElementById('customerModalTitle');
    if (customerId) {
      const customer = Storage.customers.find(customerId);
      if (customer) {
        title.textContent = 'Edit Customer';
        document.getElementById('customerId').value = customer.id;
        document.getElementById('customerName').value = customer.name || '';
        document.getElementById('customerEmail').value = customer.email || '';
        document.getElementById('customerPhone').value = customer.phone || '';
        document.getElementById('customerAddress').value = customer.address || '';
        document.getElementById('customerNotes').value = customer.notes || '';
      }
    } else {
      title.textContent = 'New Customer';
      form.reset();
      document.getElementById('customerId').value = '';
    }
    modal.style.display = 'block';
  },
  saveCustomer: () => {
    const id = document.getElementById('customerId').value;
    const customer = {
      name: document.getElementById('customerName').value,
      email: document.getElementById('customerEmail').value,
      phone: document.getElementById('customerPhone').value,
      address: document.getElementById('customerAddress').value,
      notes: document.getElementById('customerNotes').value
    };
    if (id) { Storage.customers.update(id, customer); } else { Storage.customers.add(customer); }
    document.getElementById('customerModal').style.display = 'none';
    Customers.renderList();
    Customers.updateQuoteCustomerSelect();
  },
  editCustomer: (id) => { Customers.openModal(id); },
  deleteCustomer: (id) => {
    if (confirm('Are you sure you want to delete this customer?')) {
      Storage.customers.delete(id);
      Customers.renderList();
      if (Customers.currentCustomer === id) {
        Customers.currentCustomer = null;
        document.getElementById('lotSection').classList.add('is-hidden');
      }
    }
  },
  selectCustomer: (id) => {
    Customers.currentCustomer = id;
    const customer = Storage.customers.find(id);
    document.getElementById('selectedCustomerInfo').innerHTML = `<h4>${Utils.escapeHtml(customer.name)}</h4>${customer.email ? `<div>${Utils.escapeHtml(customer.email)}</div>` : ''}${customer.phone ? `<div>${Utils.escapeHtml(customer.phone)}</div>` : ''}`;
    document.getElementById('lotSection').classList.remove('is-hidden');
    if (typeof LotHistory !== 'undefined') LotHistory.renderList(id);
    Customers.updateQuoteCustomerSelect();
  },
  updateQuoteCustomerSelect: () => {
    const select = document.getElementById('quoteCustomer');
    const customers = Storage.customers.getAll();
    select.innerHTML = '<option value="">Select customer...</option>' + customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (Customers.currentCustomer) { select.value = Customers.currentCustomer; }
  }
};
