import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

// Ensure screenshot output directory exists
const SCREENSHOT_DIR = path.join(__dirname, "../tests-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper to check horizontal scroll overflow
async function assertNoHorizontalOverflow(page, name: string) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, `Page ${name} has horizontal scroll overflow: ${scrollWidth}px > ${clientWidth}px`).toBeLessThanOrEqual(clientWidth);
}

// Helper to capture structured viewport screenshots
async function captureScreenshot(page, viewportName: string, pageName: string) {
  const screenshotPath = path.join(SCREENSHOT_DIR, `${viewportName}-${pageName}.png`);
  await page.screenshot({ path: screenshotPath });
  console.log(`Captured screenshot: ${screenshotPath}`);
}

test.describe("ApplyWizard Email Operations Console Prototype E2E Tests", () => {
  
  // Register automated mock dialog handler globally for the pages in the suite
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      console.log(`Intercepted dialog: [${dialog.type()}] "${dialog.message()}"`);
      await dialog.accept();
    });
  });

  test("Overview Dashboard Flow", async ({ page }, testInfo) => {
    const viewport = testInfo.project.name;
    
    // 1. Navigate to Overview page
    await page.goto("/overview");
    await page.waitForSelector(".overview-container");

    // 2. Verify Page Title
    await expect(page.locator(".header-breadcrumbs")).toContainText("Operations Console");

    // 3. Verify Metric Cards
    await expect(page.locator(".metric-card:has-text('Total Emails')")).toBeVisible();
    await expect(page.locator(".metric-card:has-text('Applications')")).toBeVisible();
    await expect(page.locator(".metric-card:has-text('Interviews')")).toBeVisible();
    await expect(page.locator(".metric-card:has-text('Assessments')")).toBeVisible();
    await expect(page.locator(".metric-card:has-text('Rejections')")).toBeVisible();
    await expect(page.locator(".metric-card:has-text('Review Required')")).toBeVisible();

    // 4. Capture screenshot & verify horizontal overflow
    await captureScreenshot(page, viewport, "overview");
    await assertNoHorizontalOverflow(page, "overview");

    // 5. Navigate to applications list by clicking metric card
    // First metric card links to /applications
    await page.locator(".metric-card").first().click();
    await page.waitForURL("**/applications");
    await expect(page).toHaveURL(/.*applications/);
  });

  test("Applications Flow & Detail View", async ({ page }, testInfo) => {
    const viewport = testInfo.project.name;

    // 1. Navigate to Applications page
    await page.goto("/applications");
    await page.waitForSelector(".search-filter-card");

    // 2. Verify search & filter panel is visible
    await expect(page.locator("input[placeholder*='Search']")).toBeVisible();
    
    // 3. Perform a search filter query
    await page.locator("input[placeholder*='Search']").fill("Google");
    
    // 4. Capture screenshot & verify horizontal overflow
    await captureScreenshot(page, viewport, "applications");
    await assertNoHorizontalOverflow(page, "applications");

    // 5. Open an application detail page
    // app1 is Google's Software Engineer role
    await page.goto("/applications/app1");
    await page.waitForSelector(".detail-page-container");

    // 6. Verify details inside the application page
    await expect(page.locator(".subject-value")).toContainText("Google");
    await expect(page.locator(".subject-value")).toContainText("Software Engineer");
    await expect(page.locator(".email-headers-section")).toContainText("rohan.m@applywizz.ai");
    await expect(page.locator(".meta-card:has-text('Client Context')")).toContainText("Amit Sharma");
    await expect(page.getByRole("button", { name: "Mark as Reviewed" })).toBeVisible();

    // 7. Click Mark as Reviewed & verify visual toggle
    await page.getByRole("button", { name: "Mark as Reviewed" }).click();
    await expect(page.getByRole("button", { name: "Reviewed" })).toBeVisible();

    // 8. Open client profile from detail action
    await page.getByRole("link", { name: "Client Dashboard" }).click();
    await page.waitForURL("**/clients/client1");
    await expect(page).toHaveURL(/.*clients\/client1/);
  });

  test("Client Dashboard Details", async ({ page }, testInfo) => {
    const viewport = testInfo.project.name;

    // 1. Navigate to Rohan Mehta's dashboard
    await page.goto("/clients/client1");
    await page.waitForSelector(".client-dashboard-container");

    // 2. Verify details
    await expect(page.getByRole("heading", { name: "Rohan Mehta" })).toBeVisible();
    await expect(page.locator(".profile-subtext")).toContainText("rohan.m@applywizz.ai");
    await expect(page.locator(".profile-meta-details")).toContainText("Amit Sharma");
    await expect(page.locator(".profile-top-row")).toContainText("Connected & Active");

    // 3. Capture screenshot & verify horizontal overflow
    await captureScreenshot(page, viewport, "client-dashboard");
    await assertNoHorizontalOverflow(page, "client-dashboard");

    // 4. Verify metrics
    await expect(page.locator(".metric-card").first()).toBeVisible();
  });

  test("Mailbox Connections mapping flow", async ({ page }, testInfo) => {
    const viewport = testInfo.project.name;

    // 1. Navigate to Mailboxes page
    await page.goto("/mailboxes");
    await page.waitForSelector(".mailboxes-page-container");

    // 2. Capture screenshot & verify horizontal overflow
    await captureScreenshot(page, viewport, "mailboxes");
    await assertNoHorizontalOverflow(page, "mailboxes");

    // 3. Verify mailbox health counts & Needs Mapping state row
    // Venkat Nalabolu is unassigned client7
    if (viewport === "mobile") {
      const card = page.locator(".mobile-mailbox-card:has-text('Venkat Nalabolu')");
      await expect(card).toBeVisible();
      await expect(card.getByText("Needs Mapping")).toBeVisible();
    } else {
      const row = page.locator("tr:has-text('Venkat Nalabolu')");
      await expect(row).toBeVisible();
      await expect(row.getByText("Needs Mapping")).toBeVisible();
    }

    // 4. Open Map Mailbox Modal
    // If it's a mobile view, the table row is hidden and cards are used. We locate the button inside the active container.
    let mapButton;
    if (viewport === "mobile") {
      mapButton = page.locator(".mobile-mailbox-card:has-text('Venkat Nalabolu')").getByRole("button", { name: "Map Mailbox" });
    } else {
      mapButton = page.locator("tr:has-text('Venkat Nalabolu')").getByRole("button", { name: "Map Mailbox" });
    }
    await mapButton.click();

    // 5. Verify Client Select modal field is visible
    await expect(page.getByRole("heading", { name: "Map Unassigned Mailbox" })).toBeVisible();
    const select = page.locator("select#client-select");
    await expect(select).toBeVisible();

    // 6. Select "Venkat Nalabolu" from dropdown
    await select.selectOption({ label: "Venkat Nalabolu (venkat.n@gmail.com)" });

    // 7. Verify assigned CA fields auto-fill
    const caInput = page.locator("input[value='Amit Sharma']");
    await expect(caInput).toBeVisible();

    // 8. Confirm Save Mapping action updates status to Active
    await page.getByRole("button", { name: "Save Mapping" }).click();

    // Verify row or card updates status state to Active
    if (viewport === "mobile") {
      const card = page.locator(".mobile-mailbox-card:has-text('Venkat Nalabolu')");
      await expect(card.getByText("Active")).toBeVisible();
    } else {
      const updatedRow = page.locator("tr:has-text('Venkat Nalabolu')");
      await expect(updatedRow.getByText("Active")).toBeVisible();
    }
  });

  test("Review Queue Interaction", async ({ page }) => {
    // 1. Navigate to Review Queue page
    await page.goto("/review-queue");
    await page.waitForSelector(".queue-page-container");

    // 2. Switch category tabs
    const offersTab = page.getByRole("button", { name: "Offers" });
    const interviewsTab = page.getByRole("button", { name: "Interviews" });

    await offersTab.click();
    await expect(offersTab).toHaveClass(/active/);

    await interviewsTab.click();
    await expect(interviewsTab).toHaveClass(/active/);

    // 3. Test resolve alert action
    await expect(page.getByRole("button", { name: "Resolve Alert" })).toBeVisible();
    await page.getByRole("button", { name: "Resolve Alert" }).click();
  });

  test("CA Portfolio Workloads", async ({ page }) => {

    // 1. Navigate to CA portfolio page
    await page.goto("/ca-portfolio");
    await page.waitForSelector(".ca-portfolio-container");

    // 2. Select one CA card
    const caCard = page.locator(".advisor-card:has-text('Amit Sharma')");
    await caCard.click();
    await expect(caCard).toHaveClass(/active/);

    // 3. Check client table below updates list to only Amit's clients (Rohan & Sneha)
    await expect(page.getByRole("heading", { name: "Clients Assigned to Amit Sharma" })).toBeVisible();
    
    const clientList = page.locator(".table-card, .mobile-cards-list").filter({ visible: true });
    await expect(clientList.getByText("Rohan Mehta").first()).toBeVisible();
    await expect(clientList.getByText("Sneha Rao").first()).toBeVisible();
    
    // Deepika is assigned to Anjali (should not be shown under Amit)
    await expect(clientList.getByText("Deepika Padukone")).not.toBeVisible();
  });
});
