package com.urbanairmonitor.controller

import com.urbanairmonitor.service.DashboardService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/dashboard")
@CrossOrigin(origins = ["*"])
class DashboardController(private val dashboardService: DashboardService) {

    @GetMapping("/stats")
    fun getStats() = ResponseEntity.ok(dashboardService.getStats())

    @GetMapping("/chart-data")
    fun getChartData(@RequestParam(defaultValue = "weekly") period: String) =
        ResponseEntity.ok(dashboardService.getChartData(period))

    @GetMapping("/recent")
    fun getRecent() = ResponseEntity.ok(dashboardService.getRecent())
}
